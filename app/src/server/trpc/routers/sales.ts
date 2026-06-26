import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { sales, contacts, products, payments } from "../../db/schema";
import { eq, and, isNull, desc, sql, inArray, gte, lte } from "drizzle-orm";
import {
  computeSaleTotals,
  computeSaleBalance,
  computeBrokerCommission,
  productFullName,
  monetaryString,
  isoDateString,
  percentageString,
  D,
  toMoney,
} from "../../services/calculations";
import { loadSaleCostingMap, loadProductAllocations } from "../../services/fifoCostingDb";
import type { SaleCosting } from "../../services/fifoCosting";

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

// ── Enrichment ──────────────────────────────────────────────────────────────

function enrichSale(
  s: typeof sales.$inferSelect,
  product: any | undefined,
  buyer: any | undefined,
  broker: any | undefined | null,
  linkedPayments: number,
  costing: SaleCosting | undefined
) {
  const totals = computeSaleTotals(s);
  // FIFO cost of goods sold for this sale (excludes any uncosted/oversold bags).
  const cogs = costing?.cogs ?? 0;
  const uncostedBags = costing?.uncostedBags ?? 0;
  // Effective cost/kg realised by this sale (FIFO COGS over kg sold).
  const costPerKg = totals.totalKg > 0 ? toMoney(D(cogs).div(totals.totalKg)) : 0;
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

  // Overdue calculation
  let daysUntilDue: number | null = null;
  let isOverdue = false;
  if (s.dueDate && balanceReceivable > 0) {
    const due = new Date(s.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    isOverdue = daysUntilDue < 0;
  }

  return {
    ...s,
    productName: product ? productFullName(product) : "",
    buyerName: buyer?.name ?? "",
    brokerName: broker?.name ?? null,
    ...totals,
    avgCostPerKg: costPerKg,
    cogs,
    uncostedBags,
    uncosted: uncostedBags > 0,
    brokerCommission,
    grossMargin,
    grossMarginPct,
    linkedPayments,
    balanceReceivable,
    status,
    daysUntilDue,
    isOverdue,
  };
}

// ── Router ──────────────────────────────────────────────────────────────────

const dateRangeInput = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const salesRouter = router({
  list: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
    const filters = [eq(sales.tenantId, ctx.tenantId), isNull(sales.deletedAt)];
    if (input?.from) filters.push(gte(sales.date, input.from));
    if (input?.to) filters.push(lte(sales.date, input.to));
    const rows = await ctx.db
      .select()
      .from(sales)
      .where(and(...filters))
      .orderBy(desc(sales.date));

    if (rows.length === 0) return [];

    // Batch-load all related entities. FIFO costing replays the full history of
    // the products shown (date filter can't apply — earlier sales consume layers).
    const [productMap, contactMap, linkedMap, costingMap] = await Promise.all([
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
      loadSaleCostingMap(
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
        costingMap.get(s.id)
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

      const [productMap, contactMap, linkedMap, costingMap] = await Promise.all([
        loadProductMap(ctx.db, ctx.tenantId, [s.productId]),
        loadContactMap(
          ctx.db,
          ctx.tenantId,
          [s.buyerId, ...(s.brokerId ? [s.brokerId] : [])]
        ),
        loadLinkedPayments(ctx.db, ctx.tenantId, [s.displayId]),
        loadSaleCostingMap(ctx.db, ctx.tenantId, [s.productId]),
      ]);

      return enrichSale(
        s,
        productMap.get(s.productId),
        contactMap.get(s.buyerId),
        s.brokerId ? contactMap.get(s.brokerId) : null,
        linkedMap.get(s.displayId) ?? 0,
        costingMap.get(s.id)
      );
    }),

  // Lazy traceability: which purchase lot(s) fulfilled this sale, oldest-first.
  // Loaded on demand when a sale row is expanded, to keep the list payload lean.
  fulfilledFrom: protectedProcedure
    .input(z.object({ saleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const s = await ctx.db
        .select({ id: sales.id, productId: sales.productId })
        .from(sales)
        .where(and(eq(sales.id, input.saleId), eq(sales.tenantId, ctx.tenantId)))
        .then((r: any[]) => r[0]);
      if (!s) return { lots: [], uncostedBags: 0 };

      const alloc = await loadProductAllocations(ctx.db, ctx.tenantId, s.productId);
      const lots = alloc.draws
        .filter((d) => d.saleId === input.saleId)
        .map((d) => ({
          lot: d.purchaseDisplayId,
          bags: d.bags,
          ratePerKg: d.ratePerKg,
          costPerBag: d.costPerBag,
          purchaseDate: d.purchaseDate,
        }));
      return { lots, uncostedBags: alloc.uncostedBySale.get(input.saleId) ?? 0 };
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: isoDateString,
        productId: z.string().uuid(),
        buyerId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        transporterId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().positive(),
        ratePerKg: monetaryString,
        gstPct: percentageString,
        transport: monetaryString.default("0"),
        amountReceived: monetaryString.default("0"),
        ourInvoiceNo: z.string().optional(),
        paymentTermType: z.enum(["advance", "days"]).optional(),
        paymentTermDays: z.number().int().positive().optional(),
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
            transporterId: input.transporterId || null,
            qtyBags: input.qtyBags,
            kgPerBag: String(input.kgPerBag),
            ratePerKg: input.ratePerKg,
            gstPct: input.gstPct,
            transport: input.transport,
            amountReceived: input.amountReceived,
            ourInvoiceNo: input.ourInvoiceNo || null,
            paymentTermType: input.paymentTermType || null,
            paymentTermDays: input.paymentTermDays ?? null,
            dueDate: input.paymentTermType === "days" && input.paymentTermDays
              ? new Date(new Date(input.date).getTime() + input.paymentTermDays * 86400000).toISOString().split("T")[0]
              : input.paymentTermType === "advance" ? input.date : null,
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
        buyerId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        transporterId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().positive(),
        ratePerKg: monetaryString,
        gstPct: percentageString,
        transport: monetaryString.default("0"),
        amountReceived: monetaryString.default("0"),
        ourInvoiceNo: z.string().optional(),
        paymentTermType: z.enum(["advance", "days"]).optional(),
        paymentTermDays: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.id, input.id),
            eq(sales.tenantId, ctx.tenantId),
            isNull(sales.deletedAt)
          )
        )
        .then((r: any[]) => r[0]);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sale not found",
        });
      }

      const result = await ctx.db
        .update(sales)
        .set({
          date: input.date,
          productId: input.productId,
          buyerId: input.buyerId,
          viaBroker: input.viaBroker,
          brokerId: input.viaBroker ? (input.brokerId ?? null) : null,
          transporterId: input.transporterId || null,
          qtyBags: input.qtyBags,
          kgPerBag: String(input.kgPerBag),
          ratePerKg: input.ratePerKg,
          gstPct: input.gstPct,
          transport: input.transport,
          amountReceived: input.amountReceived,
          ourInvoiceNo: input.ourInvoiceNo || null,
          paymentTermType: input.paymentTermType || null,
          paymentTermDays: input.paymentTermDays ?? null,
          dueDate: input.paymentTermType === "days" && input.paymentTermDays
            ? new Date(new Date(input.date).getTime() + input.paymentTermDays * 86400000).toISOString().split("T")[0]
            : input.paymentTermType === "advance" ? input.date : null,
        })
        .where(
          and(eq(sales.id, input.id), eq(sales.tenantId, ctx.tenantId))
        )
        .returning();

      return result[0];
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
