import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { sales, contacts, products, purchases, payments } from "../../db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export const salesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(sales)
      .where(
        and(eq(sales.tenantId, ctx.tenantId), isNull(sales.deletedAt))
      )
      .orderBy(desc(sales.date));

    const result = await Promise.all(
      rows.map(async (s) => {
        const product = await ctx.db
          .select()
          .from(products)
          .where(eq(products.id, s.productId))
          .then((r) => r[0]);
        const buyer = await ctx.db
          .select()
          .from(contacts)
          .where(eq(contacts.id, s.buyerId))
          .then((r) => r[0]);
        const broker = s.brokerId
          ? await ctx.db
              .select()
              .from(contacts)
              .where(eq(contacts.id, s.brokerId))
              .then((r) => r[0])
          : null;

        // Linked payments
        const linkedPaymentsResult = await ctx.db
          .select({
            total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.partyId, s.buyerId),
              eq(payments.againstTxnId, s.displayId),
              isNull(payments.deletedAt)
            )
          );
        const linkedPayments = parseFloat(
          linkedPaymentsResult[0]?.total ?? "0"
        );

        // Avg cost calculation
        const purchasesForProduct = await ctx.db
          .select({
            totalBase: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag} * ${purchases.ratePerKg}::numeric), 0)`,
            totalKg: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag}), 0)`,
          })
          .from(purchases)
          .where(
            and(
              eq(purchases.productId, s.productId),
              eq(purchases.tenantId, ctx.tenantId),
              isNull(purchases.deletedAt)
            )
          );
        const purchaseTotalKg = parseFloat(
          purchasesForProduct[0]?.totalKg ?? "0"
        );
        const avgCostPerKg =
          purchaseTotalKg > 0
            ? parseFloat(purchasesForProduct[0]?.totalBase ?? "0") /
              purchaseTotalKg
            : 0;

        const totalKg = s.qtyBags * s.kgPerBag;
        const ratePerKg = parseFloat(s.ratePerKg);
        const gstPct = parseFloat(s.gstPct);
        const transport = parseFloat(s.transport);
        const amountReceived = parseFloat(s.amountReceived);

        const baseAmount = totalKg * ratePerKg;
        const gstAmount = (baseAmount * gstPct) / 100;
        const totalInclGst = baseAmount + gstAmount;
        const cogs = avgCostPerKg * totalKg;

        // Broker commission
        let brokerCommission = 0;
        if (s.viaBroker && broker) {
          if (broker.brokerCommissionType === "per_bag") {
            brokerCommission =
              s.qtyBags *
              parseFloat(broker.brokerCommissionValue ?? "0");
          } else if (broker.brokerCommissionType === "percentage") {
            brokerCommission =
              (baseAmount *
                parseFloat(broker.brokerCommissionValue ?? "0")) /
              100;
          }
        }

        const grossMargin =
          baseAmount - cogs - transport - brokerCommission;
        const grossMarginPct =
          baseAmount > 0 ? (grossMargin / baseAmount) * 100 : 0;

        const balanceReceivable =
          totalInclGst - amountReceived - linkedPayments;
        const status =
          balanceReceivable <= 0
            ? "Received"
            : balanceReceivable < totalInclGst
              ? "Partial"
              : "Pending";

        const productFullName = product
          ? `${product.millBrand} ${product.fibreType} ${product.count} ${product.qualityGrade}`
          : "";

        return {
          ...s,
          productName: productFullName,
          buyerName: buyer?.name ?? "",
          brokerName: broker?.name ?? null,
          totalKg,
          baseAmount,
          gstAmount,
          totalInclGst,
          avgCostPerKg,
          cogs,
          brokerCommission,
          grossMargin,
          grossMarginPct,
          linkedPayments,
          balanceReceivable,
          status,
        };
      })
    );

    return result;
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
        .then((r) => r[0]);
      if (!s) return null;

      const product = await ctx.db
        .select()
        .from(products)
        .where(eq(products.id, s.productId))
        .then((r) => r[0]);
      const buyer = await ctx.db
        .select()
        .from(contacts)
        .where(eq(contacts.id, s.buyerId))
        .then((r) => r[0]);
      const broker = s.brokerId
        ? await ctx.db
            .select()
            .from(contacts)
            .where(eq(contacts.id, s.brokerId))
            .then((r) => r[0])
        : null;

      const linkedPaymentsResult = await ctx.db
        .select({
          total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.partyId, s.buyerId),
            eq(payments.againstTxnId, s.displayId),
            isNull(payments.deletedAt)
          )
        );
      const linkedPayments = parseFloat(
        linkedPaymentsResult[0]?.total ?? "0"
      );

      const purchasesForProduct = await ctx.db
        .select({
          totalBase: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag} * ${purchases.ratePerKg}::numeric), 0)`,
          totalKg: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag}), 0)`,
        })
        .from(purchases)
        .where(
          and(
            eq(purchases.productId, s.productId),
            eq(purchases.tenantId, ctx.tenantId),
            isNull(purchases.deletedAt)
          )
        );
      const purchaseTotalKg = parseFloat(
        purchasesForProduct[0]?.totalKg ?? "0"
      );
      const avgCostPerKg =
        purchaseTotalKg > 0
          ? parseFloat(purchasesForProduct[0]?.totalBase ?? "0") /
            purchaseTotalKg
          : 0;

      const totalKg = s.qtyBags * s.kgPerBag;
      const ratePerKg = parseFloat(s.ratePerKg);
      const gstPct = parseFloat(s.gstPct);
      const transport = parseFloat(s.transport);
      const amountReceived = parseFloat(s.amountReceived);

      const baseAmount = totalKg * ratePerKg;
      const gstAmount = (baseAmount * gstPct) / 100;
      const totalInclGst = baseAmount + gstAmount;
      const cogs = avgCostPerKg * totalKg;

      let brokerCommission = 0;
      if (s.viaBroker && broker) {
        if (broker.brokerCommissionType === "per_bag") {
          brokerCommission =
            s.qtyBags *
            parseFloat(broker.brokerCommissionValue ?? "0");
        } else if (broker.brokerCommissionType === "percentage") {
          brokerCommission =
            (baseAmount *
              parseFloat(broker.brokerCommissionValue ?? "0")) /
            100;
        }
      }

      const grossMargin =
        baseAmount - cogs - transport - brokerCommission;
      const grossMarginPct =
        baseAmount > 0 ? (grossMargin / baseAmount) * 100 : 0;

      const balanceReceivable =
        totalInclGst - amountReceived - linkedPayments;
      const status =
        balanceReceivable <= 0
          ? "Received"
          : balanceReceivable < totalInclGst
            ? "Partial"
            : "Pending";

      const productFullName = product
        ? `${product.millBrand} ${product.fibreType} ${product.count} ${product.qualityGrade}`
        : "";

      return {
        ...s,
        productName: productFullName,
        buyerName: buyer?.name ?? "",
        brokerName: broker?.name ?? null,
        totalKg,
        baseAmount,
        gstAmount,
        totalInclGst,
        avgCostPerKg,
        cogs,
        brokerCommission,
        grossMargin,
        grossMarginPct,
        linkedPayments,
        balanceReceivable,
        status,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        productId: z.string().uuid(),
        buyerId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().int().positive(),
        ratePerKg: z.string(),
        gstPct: z.string(),
        transport: z.string().default("0"),
        amountReceived: z.string().default("0"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lastSale = await ctx.db
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

      const result = await ctx.db
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
          kgPerBag: input.kgPerBag,
          ratePerKg: input.ratePerKg,
          gstPct: input.gstPct,
          transport: input.transport,
          amountReceived: input.amountReceived,
        })
        .returning();

      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(sales)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(sales.id, input.id), eq(sales.tenantId, ctx.tenantId))
        );
      return { success: true };
    }),
});
