import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { payments, contacts, purchases, sales, ccEntries } from "../../db/schema";
import { eq, and, isNull, desc, sql, inArray, gte, lte } from "drizzle-orm";
import {
  computePurchaseTotals,
  computeSaleTotals,
  monetaryString,
  isoDateString,
  D,
  toMoney,
} from "../../services/calculations";
import { capBatchToBalances } from "../../services/collections";

const dateRangeInput = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const paymentsRouter = router({
  list: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
    const filters = [eq(payments.tenantId, ctx.tenantId), isNull(payments.deletedAt)];
    if (input?.from) filters.push(gte(payments.date, input.from));
    if (input?.to) filters.push(lte(payments.date, input.to));
    const rows = await ctx.db
      .select()
      .from(payments)
      .where(and(...filters))
      .orderBy(desc(payments.date));

    if (rows.length === 0) return [];

    // Batch-load party contacts (1 query instead of N)
    const partyIds = [...new Set(rows.map((r) => r.partyId))];
    const partyRows = await ctx.db
      .select()
      .from(contacts)
      .where(and(inArray(contacts.id, partyIds), eq(contacts.tenantId, ctx.tenantId)));
    const partyMap = new Map(partyRows.map((r: any) => [r.id, r]));

    return rows.map((p) => {
      const party = partyMap.get(p.partyId);
      return {
        ...p,
        partyName: party?.name ?? "",
        partyType: party?.type ?? "",
      };
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.id),
            eq(payments.tenantId, ctx.tenantId),
            isNull(payments.deletedAt)
          )
        )
        .then((r: any[]) => r[0]);

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        });
      }

      return row;
    }),

  openTransactions: protectedProcedure
    .input(z.object({ partyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const party = await ctx.db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, input.partyId), eq(contacts.tenantId, ctx.tenantId)))
        .then((r: any[]) => r[0]);
      if (!party) return [];

      const txns: Array<{ displayId: string; label: string; balance: number; total: number; date: string }> = [];

      if (party.type === "Mill") {
        const purchaseRows = await ctx.db
          .select()
          .from(purchases)
          .where(
            and(
              eq(purchases.supplierId, input.partyId),
              eq(purchases.tenantId, ctx.tenantId),
              isNull(purchases.deletedAt)
            )
          );

        // Batch-load linked payments for all these purchases
        const displayIds = purchaseRows.map((p: any) => p.displayId);
        const linkedMap = await batchLinkedPayments(ctx.db, ctx.tenantId, displayIds);

        for (const p of purchaseRows) {
          const totals = computePurchaseTotals(p);
          const linked = linkedMap.get(p.displayId) ?? 0;
          const balance = toMoney(
            D(totals.grandTotal).minus(D(p.amountPaid)).minus(linked)
          );
          if (balance > 0) {
            txns.push({
              displayId: p.displayId,
              label: `${p.displayId} — ₹${balance.toLocaleString("en-IN")} due`,
              balance,
              total: totals.grandTotal,
              date: p.date,
            });
          }
        }
      } else if (party.type === "Buyer") {
        const saleRows = await ctx.db
          .select()
          .from(sales)
          .where(
            and(
              eq(sales.buyerId, input.partyId),
              eq(sales.tenantId, ctx.tenantId),
              isNull(sales.deletedAt)
            )
          );

        const displayIds = saleRows.map((s: any) => s.displayId);
        const linkedMap = await batchLinkedPayments(ctx.db, ctx.tenantId, displayIds);

        for (const s of saleRows) {
          const totals = computeSaleTotals(s);
          const linked = linkedMap.get(s.displayId) ?? 0;
          const balance = toMoney(
            D(totals.totalInclGst).minus(D(s.amountReceived)).minus(linked)
          );
          if (balance > 0) {
            txns.push({
              displayId: s.displayId,
              label: `${s.displayId} — ₹${balance.toLocaleString("en-IN")} due`,
              balance,
              total: totals.totalInclGst,
              date: s.date,
            });
          }
        }
      }
      return txns;
    }),

  // Collections inbox: every buyer with an outstanding balance, plus their open
  // bills, for the tap-to-approve flow. Sorted overdue-first, then largest owed.
  collectionsInbox: protectedProcedure.query(async ({ ctx }) => {
    const buyers = await ctx.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, ctx.tenantId),
          eq(contacts.type, "Buyer"),
          isNull(contacts.deletedAt)
        )
      );
    if (buyers.length === 0) return [];
    const buyerName = new Map(buyers.map((b: any) => [b.id, b.name]));

    const saleRows = await ctx.db
      .select()
      .from(sales)
      .where(
        and(
          inArray(sales.buyerId, buyers.map((b: any) => b.id)),
          eq(sales.tenantId, ctx.tenantId),
          isNull(sales.deletedAt)
        )
      );
    const linkedMap = await batchLinkedPayments(
      ctx.db,
      ctx.tenantId,
      saleRows.map((s: any) => s.displayId)
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type Bill = {
      displayId: string;
      balance: number;
      total: number;
      date: string;
      dueDate: string | null;
      isOverdue: boolean;
      daysOverdue: number;
    };
    const billsByBuyer = new Map<string, Bill[]>();

    for (const s of saleRows) {
      const totals = computeSaleTotals(s);
      const linked = linkedMap.get(s.displayId) ?? 0;
      const balance = toMoney(D(totals.totalInclGst).minus(D(s.amountReceived)).minus(linked));
      if (balance <= 0) continue;

      let isOverdue = false;
      let daysOverdue = 0;
      if (s.dueDate) {
        const due = new Date(s.dueDate);
        due.setHours(0, 0, 0, 0);
        daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
        isOverdue = daysOverdue > 0;
      }

      const arr = billsByBuyer.get(s.buyerId) ?? [];
      arr.push({
        displayId: s.displayId,
        balance,
        total: totals.totalInclGst,
        date: s.date,
        dueDate: s.dueDate ?? null,
        isOverdue,
        daysOverdue: Math.max(0, daysOverdue),
      });
      billsByBuyer.set(s.buyerId, arr);
    }

    const parties = [];
    for (const [buyerId, bills] of billsByBuyer) {
      bills.sort((a, b) => a.date.localeCompare(b.date)); // oldest-first for FIFO
      const totalOutstanding = toMoney(
        bills.reduce((acc, b) => acc.plus(b.balance), D(0))
      );
      const overdueBills = bills.filter((b) => b.isOverdue);
      parties.push({
        partyId: buyerId,
        partyName: buyerName.get(buyerId) ?? "",
        totalOutstanding,
        billCount: bills.length,
        isOverdue: overdueBills.length > 0,
        daysOverdue: overdueBills.reduce((m, b) => Math.max(m, b.daysOverdue), 0),
        bills,
      });
    }

    // Overdue parties first, then by largest outstanding.
    parties.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return b.totalOutstanding - a.totalOutstanding;
    });
    return parties;
  }),

  // Batch-record buyer collections from the tap-to-approve inbox. Each item is
  // one bill; amounts are re-validated against current balances at save time so
  // a stale screen can never overpay or double-record.
  recordCollections: protectedProcedure
    .input(
      z.object({
        date: isoDateString,
        mode: z.enum(["Cash", "NEFT", "UPI", "Cheque", "RTGS"]),
        viaCC: z.boolean().default(true),
        items: z
          .array(
            z.object({
              saleDisplayId: z.string(),
              amount: monetaryString,
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        const displayIds = [...new Set(input.items.map((i) => i.saleDisplayId))];
        const saleRows = await tx
          .select()
          .from(sales)
          .where(
            and(
              inArray(sales.displayId, displayIds),
              eq(sales.tenantId, ctx.tenantId),
              isNull(sales.deletedAt)
            )
          );
        const saleByDisplay = new Map(saleRows.map((s: any) => [s.displayId, s]));
        const linkedMap = await batchLinkedPayments(tx, ctx.tenantId, displayIds);

        const balances = saleRows.map((s: any) => {
          const totals = computeSaleTotals(s);
          const linked = linkedMap.get(s.displayId) ?? 0;
          return {
            displayId: s.displayId,
            balance: toMoney(D(totals.totalInclGst).minus(D(s.amountReceived)).minus(linked)),
          };
        });

        const { toRecord, skipped } = capBatchToBalances(
          input.items.map((i) => ({ displayId: i.saleDisplayId, amount: Number(i.amount) })),
          balances
        );

        // Buyer names for CC notes.
        const buyerIds = [...new Set(saleRows.map((s: any) => s.buyerId))] as string[];
        const buyerRows = buyerIds.length
          ? await tx
              .select({ id: contacts.id, name: contacts.name })
              .from(contacts)
              .where(and(inArray(contacts.id, buyerIds), eq(contacts.tenantId, ctx.tenantId)))
          : [];
        const buyerName = new Map(buyerRows.map((b: any) => [b.id, b.name]));

        // CC running balance (sequential repays within the batch).
        let prevBalance = D(0);
        if (input.viaCC && toRecord.length > 0) {
          const lastEntry = await tx
            .select()
            .from(ccEntries)
            .where(eq(ccEntries.tenantId, ctx.tenantId))
            .orderBy(desc(ccEntries.date), desc(ccEntries.createdAt))
            .limit(1);
          prevBalance = D(lastEntry[0]?.runningBalance ?? "0");
        }

        let total = D(0);
        const createdPaymentIds: string[] = [];
        for (const rec of toRecord) {
          const s: any = saleByDisplay.get(rec.displayId);
          const amountStr = D(rec.amount).toFixed(2);
          const inserted = await tx
            .insert(payments)
            .values({
              tenantId: ctx.tenantId,
              date: input.date,
              partyId: s.buyerId,
              direction: "Received",
              amount: amountStr,
              mode: input.mode,
              againstTxnId: rec.displayId,
              reference: null,
              notes: "Collection (quick approve)",
              viaCC: input.viaCC,
            })
            .returning({ id: payments.id });
          createdPaymentIds.push(inserted[0].id);
          total = total.plus(rec.amount);

          if (input.viaCC) {
            const newBalance = prevBalance.minus(rec.amount);
            await tx.insert(ccEntries).values({
              tenantId: ctx.tenantId,
              date: input.date,
              event: "Repay",
              amount: amountStr,
              runningBalance: newBalance.toFixed(2),
              notes: `Auto: Received from ${buyerName.get(s.buyerId) ?? "Unknown"} (${rec.displayId})`,
            });
            prevBalance = newBalance;
          }
        }

        return {
          recordedCount: toRecord.length,
          totalAmount: toMoney(total),
          skipped,
          createdPaymentIds,
        };
      });
    }),

  // Undo a batch of just-recorded collections: soft-delete each payment and
  // reverse its CC entry (mirrors `delete`). Powers the success-toast Undo.
  undoCollections: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        const deleted = await tx
          .update(payments)
          .set({ deletedAt: new Date() })
          .where(
            and(
              inArray(payments.id, input.ids),
              eq(payments.tenantId, ctx.tenantId),
              isNull(payments.deletedAt)
            )
          )
          .returning();

        for (const payment of deleted) {
          if (!payment.viaCC) continue;
          const reverseEvent = payment.direction === "Paid" ? "Repay" : "Draw";
          const lastEntry = await tx
            .select()
            .from(ccEntries)
            .where(eq(ccEntries.tenantId, ctx.tenantId))
            .orderBy(desc(ccEntries.date), desc(ccEntries.createdAt))
            .limit(1);
          const prevBalance = D(lastEntry[0]?.runningBalance ?? "0");
          const amount = D(payment.amount);
          const newBalance =
            reverseEvent === "Draw" ? prevBalance.plus(amount) : prevBalance.minus(amount);
          await tx.insert(ccEntries).values({
            tenantId: ctx.tenantId,
            date: new Date().toISOString().split("T")[0],
            event: reverseEvent,
            amount: payment.amount,
            runningBalance: newBalance.toFixed(2),
            notes: "Auto-reversed: undone collection",
          });
        }

        return { undoneCount: deleted.length };
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: isoDateString,
        partyId: z.string().uuid(),
        direction: z.enum(["Paid", "Received"]),
        amount: monetaryString,
        mode: z.enum(["Cash", "NEFT", "UPI", "Cheque", "RTGS"]),
        againstTxnId: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        viaCC: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        // 1. Insert payment
        const result = await tx
          .insert(payments)
          .values({
            tenantId: ctx.tenantId,
            date: input.date,
            partyId: input.partyId,
            direction: input.direction,
            amount: input.amount,
            mode: input.mode,
            againstTxnId: input.againstTxnId || null,
            reference: input.reference || null,
            notes: input.notes || null,
            viaCC: input.viaCC,
          })
          .returning();
        const payment = result[0];

        // 2. Auto-create CC entry if viaCC
        if (input.viaCC) {
          // Fetch party name for the CC note
          const party = await tx
            .select({ name: contacts.name })
            .from(contacts)
            .where(eq(contacts.id, input.partyId))
            .then((r: any[]) => r[0]);
          const partyName = party?.name ?? "Unknown";
          const txnRef = input.againstTxnId ? ` (${input.againstTxnId})` : "";

          const ccEvent = input.direction === "Paid" ? "Draw" : "Repay";
          const ccNote =
            input.direction === "Paid"
              ? `Auto: Payment to ${partyName}${txnRef}`
              : `Auto: Received from ${partyName}${txnRef}`;

          // Get last CC balance
          const lastEntry = await tx
            .select()
            .from(ccEntries)
            .where(eq(ccEntries.tenantId, ctx.tenantId))
            .orderBy(desc(ccEntries.date), desc(ccEntries.createdAt))
            .limit(1);

          const prevBalance = D(lastEntry[0]?.runningBalance ?? "0");
          const amount = D(input.amount);
          const newBalance =
            ccEvent === "Draw"
              ? prevBalance.plus(amount)
              : prevBalance.minus(amount);

          await tx.insert(ccEntries).values({
            tenantId: ctx.tenantId,
            date: input.date,
            event: ccEvent,
            amount: input.amount,
            runningBalance: newBalance.toFixed(2),
            notes: ccNote,
          });
        }

        return payment;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        date: isoDateString,
        partyId: z.string().uuid(),
        direction: z.enum(["Paid", "Received"]),
        amount: monetaryString,
        mode: z.enum(["Cash", "NEFT", "UPI", "Cheque", "RTGS"]),
        againstTxnId: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        viaCC: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.id),
            eq(payments.tenantId, ctx.tenantId),
            isNull(payments.deletedAt)
          )
        )
        .then((r: any[]) => r[0]);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        });
      }

      const result = await ctx.db
        .update(payments)
        .set({
          date: input.date,
          partyId: input.partyId,
          direction: input.direction,
          amount: input.amount,
          mode: input.mode,
          againstTxnId: input.againstTxnId || null,
          reference: input.reference || null,
          notes: input.notes || null,
          viaCC: input.viaCC,
        })
        .where(
          and(
            eq(payments.id, input.id),
            eq(payments.tenantId, ctx.tenantId)
          )
        )
        .returning();

      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        // Soft-delete the payment and get its details
        const result = await tx
          .update(payments)
          .set({ deletedAt: new Date() })
          .where(
            and(eq(payments.id, input.id), eq(payments.tenantId, ctx.tenantId))
          )
          .returning();

        if (result.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payment not found",
          });
        }

        const payment = result[0];

        // If payment was via CC, create a reversing CC entry
        if (payment.viaCC) {
          const reverseEvent = payment.direction === "Paid" ? "Repay" : "Draw";

          const lastEntry = await tx
            .select()
            .from(ccEntries)
            .where(eq(ccEntries.tenantId, ctx.tenantId))
            .orderBy(desc(ccEntries.date), desc(ccEntries.createdAt))
            .limit(1);

          const prevBalance = D(lastEntry[0]?.runningBalance ?? "0");
          const amount = D(payment.amount);
          const newBalance =
            reverseEvent === "Draw"
              ? prevBalance.plus(amount)
              : prevBalance.minus(amount);

          await tx.insert(ccEntries).values({
            tenantId: ctx.tenantId,
            date: new Date().toISOString().split("T")[0],
            event: reverseEvent,
            amount: payment.amount,
            runningBalance: newBalance.toFixed(2),
            notes: "Auto-reversed: deleted payment",
          });
        }

        return { success: true };
      });
    }),
});

// ── Helper ──────────────────────────────────────────────────────────────────

async function batchLinkedPayments(
  db: any,
  tenantId: string,
  displayIds: string[]
): Promise<Map<string, number>> {
  if (displayIds.length === 0) return new Map();
  const unique = [...new Set(displayIds)];
  const rows = await db
    .select({
      againstTxnId: payments.againstTxnId,
      total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.againstTxnId, unique),
        eq(payments.tenantId, tenantId),
        isNull(payments.deletedAt)
      )
    )
    .groupBy(payments.againstTxnId);
  return new Map(rows.map((r: any) => [r.againstTxnId!, parseFloat(r.total)]));
}
