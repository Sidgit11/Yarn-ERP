import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { sales, contacts, products, purchases, payments } from "../../db/schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import {
  computeSaleTotals,
  computeSaleBalance,
  computeBrokerCommission,
  computeAvgCostPerKg,
  productFullName,
  monetaryString,
  isoDateString,
  percentageString,
  D,
  toMoney,
} from "../../services/calculations";

// ── Batch helpers (shared pattern) ──────────────────────────────────────────

async function loadContactMap(db: any, tenantId: string, ids: string[]): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map();
  const unique = [...new Set(ids)];
  const rows = await db
    .select()
    .from(contacts)
    .where(and(inArray(contacts.id, unique), eq(contacts.tenantId, tenantId)));
  return new Map(rows.map((r: any) => [r.id, r]));
}

async function loadProductMap(db: any, tenantId: string, ids: string[]): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map();
  const unique = [...new Set(ids)];
  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, unique), eq(products.tenantId, tenantId)));
  return new Map(rows.map((r: any) => [r.id, r]));
}

async function loadLinkedPayments(db: any, tenantId: string, displayIds: string[]): Promise<Map<string, number>> {
  if (displayIds.length === 0) return new Map<string, number>();
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

/** Batch-load avg cost per kg for each product ID. Single aggregate query. */
async function loadAvgCosts(
  db: any,
  tenantId: string,
  productIds: string[]
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const unique = [...new Set(productIds)];
  const rows = await db
    .select({
      productId: purchases.productId,
      totalBase: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag} * ${purchases.ratePerKg}::numeric), 0)`,
      totalKg: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag}), 0)`,
    })
    .from(purchases)
    .where(
      and(
        inArray(purchases.productId, unique),
        eq(purchases.tenantId, tenantId),
        isNull(purchases.deletedAt)
      )
    )
    .groupBy(purchases.productId);

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.productId, computeAvgCostPerKg(r.totalBase, r.totalKg));
  }
  return map;
}

// ── Enrichment ──────────────────────────────────────────────────────────────

function enrichSale(
  s: typeof sales.$inferSelect,
  product: any | undefined,
  buyer: any | undefined,
  broker: any | undefined | null,
  linkedPayments: number,
  avgCostPerKg: number
) {
  const totals = computeSaleTotals(s);
  const cogs = toMoney(D(avgCostPerKg).mul(totals.totalKg));
  const transport = toMoney(D(s.transport));

  const brokerCommission = broker
    ? computeBrokerCommission(
        broker.brokerCommissionType,
        broker.brokerCommissionValue,
        s.qtyBags,
        totals.baseAmount
      )
    : 0;

  const grossMargin = toMoney(
    D(totals.baseAmount).minus(cogs).minus(transport).minus(brokerCommission)
  );
  const grossMarginPct =
    totals.baseAmount > 0
      ? toMoney(D(grossMargin).div(totals.baseAmount).mul(100))
      : 0;

  const { balanceReceivable, status } = computeSaleBalance(
    totals.totalInclGst,
    s.amountReceived,
    linkedPayments
  );

  return {
    ...s,
    productName: product ? productFullName(product) : "",
    buyerName: buyer?.name ?? "",
    brokerName: broker?.name ?? null,
    ...totals,
    avgCostPerKg,
    cogs,
    brokerCommission,
    grossMargin,
    grossMarginPct,
    linkedPayments,
    balanceReceivable,
    status,
  };
}

// ── Router ──────────────────────────────────────────────────────────────────

export const salesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(sales)
      .where(and(eq(sales.tenantId, ctx.tenantId), isNull(sales.deletedAt)))
      .orderBy(desc(sales.date));

    if (rows.length === 0) return [];

    // Batch-load all related entities (4 queries instead of 5N)
    const [productMap, contactMap, linkedMap, avgCostMap] = await Promise.all([
      loadProductMap(ctx.db, ctx.tenantId, rows.map((r) => r.productId)),
      loadContactMap(
        ctx.db,
        ctx.tenantId,
        rows.flatMap((r) => [r.buyerId, ...(r.brokerId ? [r.brokerId] : [])])
      ),
      loadLinkedPayments(
        ctx.db,
        ctx.tenantId,
        rows.map((r) => r.displayId)
      ),
      loadAvgCosts(
        ctx.db,
        ctx.tenantId,
        rows.map((r) => r.productId)
      ),
    ]);

    return rows.map((s) =>
      enrichSale(
        s,
        productMap.get(s.productId),
        contactMap.get(s.buyerId),
        s.brokerId ? contactMap.get(s.brokerId) : null,
        linkedMap.get(s.displayId) ?? 0,
        avgCostMap.get(s.productId) ?? 0
      )
    );
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const s = await ctx.db
        .select()
        .from(sales)
        .where(
          and(eq(sales.id, input.id), eq(sales.tenantId, ctx.tenantId))
        )
        .then((r: any[]) => r[0]);
      if (!s) return null;

      const [productMap, contactMap, linkedMap, avgCostMap] = await Promise.all([
        loadProductMap(ctx.db, ctx.tenantId, [s.productId]),
        loadContactMap(
          ctx.db,
          ctx.tenantId,
          [s.buyerId, ...(s.brokerId ? [s.brokerId] : [])]
        ),
        loadLinkedPayments(ctx.db, ctx.tenantId, [s.displayId]),
        loadAvgCosts(ctx.db, ctx.tenantId, [s.productId]),
      ]);

      return enrichSale(
        s,
        productMap.get(s.productId),
        contactMap.get(s.buyerId),
        s.brokerId ? contactMap.get(s.brokerId) : null,
        linkedMap.get(s.displayId) ?? 0,
        avgCostMap.get(s.productId) ?? 0
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: isoDateString,
        productId: z.string().uuid(),
        buyerId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().positive(),
        ratePerKg: monetaryString,
        gstPct: percentageString,
        transport: monetaryString.default("0"),
        amountReceived: monetaryString.default("0"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        const lastSale = await tx
          .select({ displayId: sales.displayId })
          .from(sales)
          .where(eq(sales.tenantId, ctx.tenantId))
          .orderBy(desc(sales.displayId))
          .limit(1);

        const lastId = lastSale[0]?.displayId ?? null;
        const nextNum = lastId
          ? parseInt(lastId.replace("S", ""), 10) + 1
          : 1;
        const displayId = `S${String(nextNum).padStart(3, "0")}`;

        const result = await tx
          .insert(sales)
          .values({
            tenantId: ctx.tenantId,
            displayId,
            date: input.date,
            productId: input.productId,
            buyerId: input.buyerId,
            viaBroker: input.viaBroker,
            brokerId: input.viaBroker ? (input.brokerId ?? null) : null,
            qtyBags: input.qtyBags,
            kgPerBag: String(input.kgPerBag),
            ratePerKg: input.ratePerKg,
            gstPct: input.gstPct,
            transport: input.transport,
            amountReceived: input.amountReceived,
          })
          .returning();

        return result[0];
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(sales)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(sales.id, input.id), eq(sales.tenantId, ctx.tenantId))
        )
        .returning({ id: sales.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sale not found",
        });
      }
      return { success: true };
    }),
});
