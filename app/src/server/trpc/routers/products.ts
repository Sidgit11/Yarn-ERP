import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { products, purchases, sales, contacts, payments } from "../../db/schema";
import { eq, and, isNull, asc, desc, sql, inArray } from "drizzle-orm";
import {
  computePurchaseTotals,
  computeSaleTotals,
  computeBrokerCommission,
  computeAvgCostPerKg,
  productFullName,
  D,
  toMoney,
} from "../../services/calculations";

export const productsRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.select().from(products)
        .where(and(
          eq(products.tenantId, ctx.tenantId),
          isNull(products.deletedAt),
        ))
        .orderBy(asc(products.millBrand));
      return rows.map((row) => ({
        ...row,
        fullName: `${row.millBrand} ${row.fibreType} ${row.count} ${row.qualityGrade}${row.colorShade ? ` ${row.colorShade}` : ""}`,
      }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.select().from(products).where(
        and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId))
      );
      if (!result[0]) return null;
      const row = result[0];
      return {
        ...row,
        fullName: `${row.millBrand} ${row.fibreType} ${row.count} ${row.qualityGrade}${row.colorShade ? ` ${row.colorShade}` : ""}`,
      };
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 1. Get the product
      const product = await ctx.db
        .select()
        .from(products)
        .where(
          and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId))
        )
        .then((r: any[]) => r[0]);

      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }

      // 2. Get all purchases for this product (not deleted)
      const allPurchases = await ctx.db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.productId, input.id),
            eq(purchases.tenantId, ctx.tenantId),
            isNull(purchases.deletedAt)
          )
        )
        .orderBy(desc(purchases.date));

      // 3. Get all sales for this product (not deleted)
      const allSales = await ctx.db
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.productId, input.id),
            eq(sales.tenantId, ctx.tenantId),
            isNull(sales.deletedAt)
          )
        )
        .orderBy(desc(sales.date));

      // 4. Batch-load linked payment sums by displayId
      const allDisplayIds = [
        ...allPurchases.map((p: any) => p.displayId),
        ...allSales.map((s: any) => s.displayId),
      ];
      let linkedMap = new Map<string, number>();
      if (allDisplayIds.length > 0) {
        const unique = [...new Set(allDisplayIds)];
        const paymentRows = await ctx.db
          .select({
            againstTxnId: payments.againstTxnId,
            total: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
          })
          .from(payments)
          .where(
            and(
              inArray(payments.againstTxnId, unique),
              eq(payments.tenantId, ctx.tenantId),
              isNull(payments.deletedAt)
            )
          )
          .groupBy(payments.againstTxnId);
        linkedMap = new Map(paymentRows.map((r: any) => [r.againstTxnId!, parseFloat(r.total)]));
      }

      // 5. Batch-load contacts (suppliers, buyers, brokers)
      const contactIds = [
        ...allPurchases.map((p: any) => p.supplierId),
        ...allPurchases.filter((p: any) => p.brokerId).map((p: any) => p.brokerId),
        ...allSales.map((s: any) => s.buyerId),
        ...allSales.filter((s: any) => s.brokerId).map((s: any) => s.brokerId),
      ];
      let contactMap = new Map<string, any>();
      if (contactIds.length > 0) {
        const uniqueContactIds = [...new Set(contactIds)];
        const contactRows = await ctx.db
          .select()
          .from(contacts)
          .where(
            and(
              inArray(contacts.id, uniqueContactIds),
              eq(contacts.tenantId, ctx.tenantId)
            )
          );
        contactMap = new Map(contactRows.map((r: any) => [r.id, r]));
      }

      // 6. Compute analytics

      // -- Purchase summary --
      let purchaseTotalBase = D(0);
      let purchaseTotalKg = D(0);
      let totalPurchasedBags = 0;
      const supplierAgg = new Map<string, { name: string; count: number; totalBase: number }>();

      for (const p of allPurchases) {
        const totals = computePurchaseTotals(p);
        purchaseTotalBase = purchaseTotalBase.plus(D(totals.baseAmount));
        purchaseTotalKg = purchaseTotalKg.plus(D(totals.totalKg));
        totalPurchasedBags += p.qtyBags;

        const supplier = contactMap.get(p.supplierId);
        const supplierName = supplier?.name ?? "Unknown";
        const existing = supplierAgg.get(p.supplierId);
        if (existing) {
          existing.count += 1;
          existing.totalBase += totals.baseAmount;
        } else {
          supplierAgg.set(p.supplierId, {
            name: supplierName,
            count: 1,
            totalBase: totals.baseAmount,
          });
        }
      }

      const avgCostPerKg = computeAvgCostPerKg(
        purchaseTotalBase.toString(),
        purchaseTotalKg.toString()
      );

      // -- Sale summary --
      let saleTotalRevenue = D(0);
      let saleTotalKg = D(0);
      let saleTotalCogs = D(0);
      let saleTotalTransport = D(0);
      let saleTotalBrokerCommission = D(0);
      let totalSoldBags = 0;
      const buyerAgg = new Map<
        string,
        { name: string; count: number; totalRevenue: number; totalKg: number; totalCogs: number; totalTransport: number; totalBrokerComm: number }
      >();

      for (const s of allSales) {
        const totals = computeSaleTotals(s);
        const cogs = toMoney(D(avgCostPerKg).mul(totals.totalKg));
        const transport = toMoney(D(s.transport));
        const broker = s.brokerId ? contactMap.get(s.brokerId) : null;
        const brokerCommission = broker
          ? computeBrokerCommission(
              broker.brokerCommissionType,
              broker.brokerCommissionValue,
              s.qtyBags,
              totals.baseAmount
            )
          : 0;

        saleTotalRevenue = saleTotalRevenue.plus(D(totals.baseAmount));
        saleTotalKg = saleTotalKg.plus(D(totals.totalKg));
        saleTotalCogs = saleTotalCogs.plus(D(cogs));
        saleTotalTransport = saleTotalTransport.plus(D(transport));
        saleTotalBrokerCommission = saleTotalBrokerCommission.plus(D(brokerCommission));
        totalSoldBags += s.qtyBags;

        const buyer = contactMap.get(s.buyerId);
        const buyerName = buyer?.name ?? "Unknown";
        const existing = buyerAgg.get(s.buyerId);
        if (existing) {
          existing.count += 1;
          existing.totalRevenue += totals.baseAmount;
          existing.totalKg += totals.totalKg;
          existing.totalCogs += cogs;
          existing.totalTransport += transport;
          existing.totalBrokerComm += brokerCommission;
        } else {
          buyerAgg.set(s.buyerId, {
            name: buyerName,
            count: 1,
            totalRevenue: totals.baseAmount,
            totalKg: totals.totalKg,
            totalCogs: cogs,
            totalTransport: transport,
            totalBrokerComm: brokerCommission,
          });
        }
      }

      const grossMargin = toMoney(
        saleTotalRevenue.minus(saleTotalCogs).minus(saleTotalTransport).minus(saleTotalBrokerCommission)
      );
      const grossMarginPct = saleTotalRevenue.gt(0)
        ? toMoney(D(grossMargin).div(saleTotalRevenue).mul(100))
        : 0;

      // -- Inventory --
      const totalPurchasedKg = toMoney(purchaseTotalKg);
      const totalSoldKg = toMoney(saleTotalKg);
      const bagsInHand = totalPurchasedBags - totalSoldBags;
      const kgInHand = toMoney(purchaseTotalKg.minus(saleTotalKg));
      const inventoryValue = toMoney(D(kgInHand).mul(D(avgCostPerKg)));

      // -- Per-buyer breakdown --
      const buyers = Array.from(buyerAgg.values()).map((b) => {
        const margin = toMoney(
          D(b.totalRevenue).minus(D(b.totalCogs)).minus(D(b.totalTransport)).minus(D(b.totalBrokerComm))
        );
        const marginPct = b.totalRevenue > 0 ? toMoney(D(margin).div(D(b.totalRevenue)).mul(100)) : 0;
        return {
          name: b.name,
          count: b.count,
          totalRevenue: b.totalRevenue,
          totalKg: b.totalKg,
          avgPrice: b.totalKg > 0 ? toMoney(D(b.totalRevenue).div(D(b.totalKg))) : 0,
          grossMargin: margin,
          grossMarginPct: marginPct,
        };
      });

      // -- Recent transactions (last 5 of each) --
      const recentPurchases = allPurchases.slice(0, 5).map((p: any) => {
        const totals = computePurchaseTotals(p);
        const supplier = contactMap.get(p.supplierId);
        return {
          displayId: p.displayId,
          date: p.date,
          supplierName: supplier?.name ?? "Unknown",
          qtyBags: p.qtyBags,
          ratePerKg: p.ratePerKg,
          grandTotal: totals.grandTotal,
        };
      });

      const recentSales = allSales.slice(0, 5).map((s: any) => {
        const totals = computeSaleTotals(s);
        const buyer = contactMap.get(s.buyerId);
        const cogs = toMoney(D(avgCostPerKg).mul(totals.totalKg));
        const transport = toMoney(D(s.transport));
        const broker = s.brokerId ? contactMap.get(s.brokerId) : null;
        const brokerComm = broker
          ? computeBrokerCommission(
              broker.brokerCommissionType,
              broker.brokerCommissionValue,
              s.qtyBags,
              totals.baseAmount
            )
          : 0;
        const margin = toMoney(D(totals.baseAmount).minus(D(cogs)).minus(D(transport)).minus(D(brokerComm)));
        const marginPct = totals.baseAmount > 0 ? toMoney(D(margin).div(D(totals.baseAmount)).mul(100)) : 0;
        return {
          displayId: s.displayId,
          date: s.date,
          buyerName: buyer?.name ?? "Unknown",
          qtyBags: s.qtyBags,
          ratePerKg: s.ratePerKg,
          grossMargin: margin,
          grossMarginPct: marginPct,
        };
      });

      const avgSellingPrice = saleTotalKg.gt(0)
        ? toMoney(saleTotalRevenue.div(saleTotalKg))
        : 0;

      return {
        product: { ...product, fullName: productFullName(product) },

        inventory: {
          totalPurchasedBags,
          totalPurchasedKg,
          totalSoldBags,
          totalSoldKg,
          bagsInHand,
          kgInHand,
          inventoryValue,
        },

        purchases: {
          count: allPurchases.length,
          totalBase: toMoney(purchaseTotalBase),
          totalKg: totalPurchasedKg,
          avgCostPerKg,
          suppliers: Array.from(supplierAgg.values()),
        },

        sales: {
          count: allSales.length,
          totalRevenue: toMoney(saleTotalRevenue),
          totalKg: totalSoldKg,
          avgSellingPrice,
          totalCogs: toMoney(saleTotalCogs),
          totalTransport: toMoney(saleTotalTransport),
          totalBrokerCommission: toMoney(saleTotalBrokerCommission),
          grossMargin,
          grossMarginPct,
          buyers,
        },

        recentPurchases,
        recentSales,
      };
    }),

  create: protectedProcedure
    .input(z.object({
      millBrand: z.string().min(1),
      fibreType: z.enum(["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"]),
      count: z.string().min(1),
      qualityGrade: z.enum(["Top", "Standard", "Economy"]),
      hsnCode: z.string().optional(),
      colorShade: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.insert(products).values({
        tenantId: ctx.tenantId,
        millBrand: input.millBrand,
        fibreType: input.fibreType,
        count: input.count,
        qualityGrade: input.qualityGrade,
        hsnCode: input.hsnCode || null,
        colorShade: input.colorShade || null,
      }).returning();
      return result[0];
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      millBrand: z.string().min(1),
      fibreType: z.enum(["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"]),
      count: z.string().min(1),
      qualityGrade: z.enum(["Top", "Standard", "Economy"]),
      hsnCode: z.string().optional(),
      colorShade: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.update(products)
        .set({
          millBrand: input.millBrand,
          fibreType: input.fibreType,
          count: input.count,
          qualityGrade: input.qualityGrade,
          hsnCode: input.hsnCode || null,
          colorShade: input.colorShade || null,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId)))
        .returning();
      return result[0];
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(products).where(
        and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId))
      );
      if (!existing[0]) throw new Error("Product not found");
      const result = await ctx.db.update(products)
        .set({
          active: !existing[0].active,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId)))
        .returning();
      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(products)
        .set({ deletedAt: new Date() })
        .where(and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId)));
      return { success: true };
    }),
});
