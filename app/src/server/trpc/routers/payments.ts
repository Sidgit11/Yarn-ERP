import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { payments, contacts, purchases, sales, ccEntries } from "../../db/schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import {
  computePurchaseTotals,
  computeSaleTotals,
  monetaryString,
  isoDateString,
  D,
  toMoney,
} from "../../services/calculations";

export const paymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenantId), isNull(payments.deletedAt)))
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

      const txns: Array<{ displayId: string; label: string }> = [];

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
            });
          }
        }
      }
      return txns;
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
