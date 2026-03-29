import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { payments, contacts, purchases, sales } from "../../db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export const paymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenantId), isNull(payments.deletedAt)))
      .orderBy(desc(payments.date));

    // Enrich with party name
    const result = await Promise.all(
      rows.map(async (p) => {
        const party = await ctx.db
          .select()
          .from(contacts)
          .where(eq(contacts.id, p.partyId))
          .then((r) => r[0]);
        return {
          ...p,
          partyName: party?.name ?? "",
          partyType: party?.type ?? "",
        };
      })
    );
    return result;
  }),

  // Get open transactions for a party (for "Against Txn" dropdown)
  openTransactions: protectedProcedure
    .input(z.object({ partyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get party to determine type
      const party = await ctx.db
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.partyId))
        .then((r) => r[0]);
      if (!party) return [];

      const txns: Array<{ displayId: string; label: string }> = [];

      if (party.type === "Mill") {
        // Get purchases from this supplier with balance > 0
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
        for (const p of purchaseRows) {
          const totalKg = p.qtyBags * p.kgPerBag;
          const baseAmount = totalKg * parseFloat(p.ratePerKg);
          const gstAmount = (baseAmount * parseFloat(p.gstPct)) / 100;
          const grandTotal = baseAmount + gstAmount + parseFloat(p.transport);

          // Get linked payments total
          const linked = await ctx.db
            .select({
              total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
            })
            .from(payments)
            .where(
              and(
                eq(payments.againstTxnId, p.displayId),
                eq(payments.partyId, input.partyId),
                isNull(payments.deletedAt)
              )
            );
          const linkedTotal = parseFloat(linked[0]?.total ?? "0");
          const balance = grandTotal - parseFloat(p.amountPaid) - linkedTotal;

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
        for (const s of saleRows) {
          const totalKg = s.qtyBags * s.kgPerBag;
          const baseAmount = totalKg * parseFloat(s.ratePerKg);
          const gstAmount = (baseAmount * parseFloat(s.gstPct)) / 100;
          const totalInclGst = baseAmount + gstAmount;

          const linked = await ctx.db
            .select({
              total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
            })
            .from(payments)
            .where(
              and(
                eq(payments.againstTxnId, s.displayId),
                eq(payments.partyId, input.partyId),
                isNull(payments.deletedAt)
              )
            );
          const linkedTotal = parseFloat(linked[0]?.total ?? "0");
          const balance = totalInclGst - parseFloat(s.amountReceived) - linkedTotal;

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
        date: z.string(),
        partyId: z.string().uuid(),
        direction: z.enum(["Paid", "Received"]),
        amount: z.string(),
        mode: z.enum(["Cash", "NEFT", "UPI", "Cheque", "RTGS"]),
        againstTxnId: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
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
        })
        .returning();
      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(payments)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(payments.id, input.id), eq(payments.tenantId, ctx.tenantId))
        );
      return { success: true };
    }),
});
