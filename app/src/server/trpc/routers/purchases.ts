import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { purchases, contacts, products, payments } from "../../db/schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import {
  computePurchaseTotals,
  computePurchaseBalance,
  productFullName,
  monetaryString,
  isoDateString,
  percentageString,
  D,
  toMoney,
} from "../../services/calculations";

// ── Batch helpers ───────────────────────────────────────────────────────────

/** Load contacts into a Map keyed by id. Avoids N+1 queries. */
async function loadContactMap(
  db: any,
  tenantId: string,
  ids: string[]
): Promise<Map<string, typeof contacts.$inferSelect>> {
  if (ids.length === 0) return new Map();
  const unique = [...new Set(ids)];
  const rows = await db
    .select()
    .from(contacts)
    .where(and(inArray(contacts.id, unique), eq(contacts.tenantId, tenantId)));
  return new Map(rows.map((r: any) => [r.id, r]));
}

async function loadProductMap(
  db: any,
  tenantId: string,
  ids: string[]
): Promise<Map<string, typeof products.$inferSelect>> {
  if (ids.length === 0) return new Map();
  const unique = [...new Set(ids)];
  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, unique), eq(products.tenantId, tenantId)));
  return new Map(rows.map((r: any) => [r.id, r]));
}

/** Batch-load linked payment totals for a list of (partyId, displayId) pairs. */
async function loadLinkedPayments(
  db: any,
  tenantId: string,
  pairs: Array<{ partyId: string; displayId: string }>
): Promise<Map<string, number>> {
  if (pairs.length === 0) return new Map();
  // Single query: group by against_txn_id
  const displayIds = [...new Set(pairs.map((p) => p.displayId))];
  const rows = await db
    .select({
      againstTxnId: payments.againstTxnId,
      total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.againstTxnId, displayIds),
        eq(payments.tenantId, tenantId),
        isNull(payments.deletedAt)
      )
    )
    .groupBy(payments.againstTxnId);

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.againstTxnId!, parseFloat(r.total));
  }
  return map;
}

// ── Enrichment (shared by list + getById) ───────────────────────────────────

function enrichPurchase(
  p: typeof purchases.$inferSelect,
  product: typeof products.$inferSelect | undefined,
  supplier: typeof contacts.$inferSelect | undefined,
  broker: typeof contacts.$inferSelect | undefined | null,
  linkedPayments: number
) {
  const totals = computePurchaseTotals(p);
  const { balanceDue, status } = computePurchaseBalance(
    totals.grandTotal,
    p.amountPaid,
    linkedPayments
  );

  return {
    ...p,
    productName: product ? productFullName(product) : "",
    supplierName: supplier?.name ?? "",
    brokerName: broker?.name ?? null,
    ...totals,
    linkedPayments,
    balanceDue,
    status,
  };
}

// ── Router ──────────────────────────────────────────────────────────────────

export const purchasesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(purchases)
      .where(
        and(eq(purchases.tenantId, ctx.tenantId), isNull(purchases.deletedAt))
      )
      .orderBy(desc(purchases.date));

    if (rows.length === 0) return [];

    // Batch-load all related entities in 3 queries instead of 3N
    const [productMap, contactMap, linkedMap] = await Promise.all([
      loadProductMap(ctx.db, ctx.tenantId, rows.map((r) => r.productId)),
      loadContactMap(
        ctx.db,
        ctx.tenantId,
        rows.flatMap((r) => [r.supplierId, ...(r.brokerId ? [r.brokerId] : [])])
      ),
      loadLinkedPayments(
        ctx.db,
        ctx.tenantId,
        rows.map((r) => ({ partyId: r.supplierId, displayId: r.displayId }))
      ),
    ]);

    return rows.map((p) =>
      enrichPurchase(
        p,
        productMap.get(p.productId),
        contactMap.get(p.supplierId),
        p.brokerId ? contactMap.get(p.brokerId) : null,
        linkedMap.get(p.displayId) ?? 0
      )
    );
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.id, input.id),
            eq(purchases.tenantId, ctx.tenantId)
          )
        )
        .then((r: any[]) => r[0]);
      if (!p) return null;

      const [productMap, contactMap, linkedMap] = await Promise.all([
        loadProductMap(ctx.db, ctx.tenantId, [p.productId]),
        loadContactMap(
          ctx.db,
          ctx.tenantId,
          [p.supplierId, ...(p.brokerId ? [p.brokerId] : [])]
        ),
        loadLinkedPayments(ctx.db, ctx.tenantId, [
          { partyId: p.supplierId, displayId: p.displayId },
        ]),
      ]);

      return enrichPurchase(
        p,
        productMap.get(p.productId),
        contactMap.get(p.supplierId),
        p.brokerId ? contactMap.get(p.brokerId) : null,
        linkedMap.get(p.displayId) ?? 0
      );
    }),

  avgCostByProduct: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select({
          totalBase: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag} * ${purchases.ratePerKg}::numeric), 0)`,
          totalKg: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            eq(purchases.productId, input.productId),
            eq(purchases.tenantId, ctx.tenantId),
            isNull(purchases.deletedAt)
          )
        );
      const totalKg = D(result[0]?.totalKg);
      return totalKg.gt(0) ? toMoney(D(result[0]?.totalBase).div(totalKg)) : 0;
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: isoDateString,
        productId: z.string().uuid(),
        lotNo: z.string().optional(),
        supplierId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().positive(),
        ratePerKg: monetaryString,
        gstPct: percentageString,
        transport: monetaryString.default("0"),
        ccDrawDate: isoDateString.optional(),
        amountPaid: monetaryString.default("0"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Use transaction to avoid display ID race condition
      return await ctx.db.transaction(async (tx: any) => {
        const lastPurchase = await tx
          .select({ displayId: purchases.displayId })
          .from(purchases)
          .where(eq(purchases.tenantId, ctx.tenantId))
          .orderBy(desc(purchases.displayId))
          .limit(1);

        const lastId = lastPurchase[0]?.displayId ?? null;
        const nextNum = lastId
          ? parseInt(lastId.replace("P", ""), 10) + 1
          : 1;
        const displayId = `P${String(nextNum).padStart(3, "0")}`;

        const result = await tx
          .insert(purchases)
          .values({
            tenantId: ctx.tenantId,
            displayId,
            date: input.date,
            productId: input.productId,
            lotNo: input.lotNo || null,
            supplierId: input.supplierId,
            viaBroker: input.viaBroker,
            brokerId: input.viaBroker ? (input.brokerId ?? null) : null,
            qtyBags: input.qtyBags,
            kgPerBag: String(input.kgPerBag),
            ratePerKg: input.ratePerKg,
            gstPct: input.gstPct,
            transport: input.transport,
            ccDrawDate: input.ccDrawDate || null,
            amountPaid: input.amountPaid,
          })
          .returning();

        return result[0];
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        date: isoDateString,
        productId: z.string().uuid(),
        lotNo: z.string().optional(),
        supplierId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().positive(),
        ratePerKg: monetaryString,
        gstPct: percentageString,
        transport: monetaryString.default("0"),
        ccDrawDate: isoDateString.optional(),
        amountPaid: monetaryString.default("0"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.id, input.id),
            eq(purchases.tenantId, ctx.tenantId),
            isNull(purchases.deletedAt)
          )
        )
        .then((r: any[]) => r[0]);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Purchase not found",
        });
      }

      const result = await ctx.db
        .update(purchases)
        .set({
          date: input.date,
          productId: input.productId,
          lotNo: input.lotNo || null,
          supplierId: input.supplierId,
          viaBroker: input.viaBroker,
          brokerId: input.viaBroker ? (input.brokerId ?? null) : null,
          qtyBags: input.qtyBags,
          kgPerBag: String(input.kgPerBag),
          ratePerKg: input.ratePerKg,
          gstPct: input.gstPct,
          transport: input.transport,
          ccDrawDate: input.ccDrawDate || null,
          amountPaid: input.amountPaid,
        })
        .where(
          and(
            eq(purchases.id, input.id),
            eq(purchases.tenantId, ctx.tenantId)
          )
        )
        .returning();

      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(purchases)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(purchases.id, input.id),
            eq(purchases.tenantId, ctx.tenantId)
          )
        )
        .returning({ id: purchases.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Purchase not found",
        });
      }
      return { success: true };
    }),
});
