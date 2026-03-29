import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { purchases, contacts, products, payments } from "../../db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export const purchasesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(purchases)
      .where(
        and(eq(purchases.tenantId, ctx.tenantId), isNull(purchases.deletedAt))
      )
      .orderBy(desc(purchases.date));

    const result = await Promise.all(
      rows.map(async (p) => {
        const product = await ctx.db
          .select()
          .from(products)
          .where(eq(products.id, p.productId))
          .then((r) => r[0]);
        const supplier = await ctx.db
          .select()
          .from(contacts)
          .where(eq(contacts.id, p.supplierId))
          .then((r) => r[0]);
        const broker = p.brokerId
          ? await ctx.db
              .select()
              .from(contacts)
              .where(eq(contacts.id, p.brokerId))
              .then((r) => r[0])
          : null;

        const linkedPaymentsResult = await ctx.db
          .select({
            total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.partyId, p.supplierId),
              eq(payments.againstTxnId, p.displayId),
              isNull(payments.deletedAt)
            )
          );
        const linkedPayments = parseFloat(
          linkedPaymentsResult[0]?.total ?? "0"
        );

        const totalKg = p.qtyBags * p.kgPerBag;
        const ratePerKg = parseFloat(p.ratePerKg);
        const gstPct = parseFloat(p.gstPct);
        const transport = parseFloat(p.transport);
        const amountPaid = parseFloat(p.amountPaid);

        const baseAmount = totalKg * ratePerKg;
        const gstAmount = (baseAmount * gstPct) / 100;
        const totalInclGst = baseAmount + gstAmount;
        const grandTotal = totalInclGst + transport;
        const balanceDue = grandTotal - amountPaid - linkedPayments;
        const status =
          balanceDue <= 0
            ? "Paid"
            : balanceDue < grandTotal
              ? "Partial"
              : "Pending";

        const productFullName = product
          ? `${product.millBrand} ${product.fibreType} ${product.count} ${product.qualityGrade}`
          : "";

        return {
          ...p,
          productName: productFullName,
          supplierName: supplier?.name ?? "",
          brokerName: broker?.name ?? null,
          totalKg,
          baseAmount,
          gstAmount,
          totalInclGst,
          grandTotal,
          linkedPayments,
          balanceDue,
          status,
        };
      })
    );

    return result;
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
        .then((r) => r[0]);
      if (!p) return null;

      const product = await ctx.db
        .select()
        .from(products)
        .where(eq(products.id, p.productId))
        .then((r) => r[0]);
      const supplier = await ctx.db
        .select()
        .from(contacts)
        .where(eq(contacts.id, p.supplierId))
        .then((r) => r[0]);
      const broker = p.brokerId
        ? await ctx.db
            .select()
            .from(contacts)
            .where(eq(contacts.id, p.brokerId))
            .then((r) => r[0])
        : null;

      const linkedPaymentsResult = await ctx.db
        .select({
          total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.partyId, p.supplierId),
            eq(payments.againstTxnId, p.displayId),
            isNull(payments.deletedAt)
          )
        );
      const linkedPayments = parseFloat(
        linkedPaymentsResult[0]?.total ?? "0"
      );

      const totalKg = p.qtyBags * p.kgPerBag;
      const ratePerKg = parseFloat(p.ratePerKg);
      const gstPct = parseFloat(p.gstPct);
      const transport = parseFloat(p.transport);
      const amountPaid = parseFloat(p.amountPaid);

      const baseAmount = totalKg * ratePerKg;
      const gstAmount = (baseAmount * gstPct) / 100;
      const totalInclGst = baseAmount + gstAmount;
      const grandTotal = totalInclGst + transport;
      const balanceDue = grandTotal - amountPaid - linkedPayments;
      const status =
        balanceDue <= 0
          ? "Paid"
          : balanceDue < grandTotal
            ? "Partial"
            : "Pending";

      const productFullName = product
        ? `${product.millBrand} ${product.fibreType} ${product.count} ${product.qualityGrade}`
        : "";

      return {
        ...p,
        productName: productFullName,
        supplierName: supplier?.name ?? "",
        brokerName: broker?.name ?? null,
        totalKg,
        baseAmount,
        gstAmount,
        totalInclGst,
        grandTotal,
        linkedPayments,
        balanceDue,
        status,
      };
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
      const totalKg = parseFloat(result[0]?.totalKg ?? "0");
      return totalKg > 0
        ? parseFloat(result[0]?.totalBase ?? "0") / totalKg
        : 0;
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        productId: z.string().uuid(),
        lotNo: z.string().optional(),
        supplierId: z.string().uuid(),
        viaBroker: z.boolean().default(false),
        brokerId: z.string().uuid().optional(),
        qtyBags: z.number().int().positive(),
        kgPerBag: z.number().int().positive(),
        ratePerKg: z.string(),
        gstPct: z.string(),
        transport: z.string().default("0"),
        ccDrawDate: z.string().optional(),
        amountPaid: z.string().default("0"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const lastPurchase = await ctx.db
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

      const result = await ctx.db
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
          kgPerBag: input.kgPerBag,
          ratePerKg: input.ratePerKg,
          gstPct: input.gstPct,
          transport: input.transport,
          ccDrawDate: input.ccDrawDate || null,
          amountPaid: input.amountPaid,
        })
        .returning();

      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(purchases)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(purchases.id, input.id),
            eq(purchases.tenantId, ctx.tenantId)
          )
        );
      return { success: true };
    }),
});
