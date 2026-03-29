import { router, protectedProcedure } from "../trpc";
import { purchases, sales, payments, ccEntries, config, ccInterestMonthly, contacts, products } from "../../db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";

export const dashboardRouter = router({
  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.tenantId;

    // 1. Config
    const cfg = await ctx.db.select().from(config).where(eq(config.tenantId, tid)).then(r => r[0]);
    const ccLimit = cfg ? parseFloat(cfg.ccLimit) : 5000000;
    const ccRate = cfg ? parseFloat(cfg.ccInterestRate) : 11;

    // 2. CC Position
    const ccEntriesAll = await ctx.db.select().from(ccEntries)
      .where(eq(ccEntries.tenantId, tid))
      .orderBy(asc(ccEntries.date), asc(ccEntries.createdAt));

    const ccBalance = ccEntriesAll.length > 0 ? parseFloat(ccEntriesAll[ccEntriesAll.length - 1].runningBalance) : 0;
    const ccAvailable = ccLimit - ccBalance;
    const ccUtilization = ccLimit > 0 ? (ccBalance / ccLimit) * 100 : 0;

    // CC calculated interest (daily accrual)
    const now = new Date();
    let calcInterest = 0;
    for (let i = 0; i < ccEntriesAll.length; i++) {
      const nextDate = i < ccEntriesAll.length - 1 ? new Date(ccEntriesAll[i + 1].date) : now;
      const thisDate = new Date(ccEntriesAll[i].date);
      const days = Math.max(0, Math.floor((nextDate.getTime() - thisDate.getTime()) / (1000 * 60 * 60 * 24)));
      const bal = parseFloat(ccEntriesAll[i].runningBalance);
      calcInterest += bal * days * ccRate / 365 / 100;
    }

    // CC actual interest
    const monthlyInterest = await ctx.db.select().from(ccInterestMonthly)
      .where(eq(ccInterestMonthly.tenantId, tid));
    const actualInterest = monthlyInterest.reduce((s, r) => s + parseFloat(r.actualInterest), 0);

    // 3. Purchases aggregation
    const allPurchases = await ctx.db.select().from(purchases)
      .where(and(eq(purchases.tenantId, tid), isNull(purchases.deletedAt)));

    let totalPurchaseBase = 0;
    let totalPurchaseGst = 0;
    let totalPurchaseGrand = 0;
    let totalPurchasePaid = 0;
    let totalPurchaseTransport = 0;
    const purchaseCount = allPurchases.length;
    let pendingPurchasePayments = 0;

    // Per-product totals for COGS calculation
    const productPurchases: Record<string, { totalBase: number; totalKg: number }> = {};

    for (const p of allPurchases) {
      const totalKg = p.qtyBags * p.kgPerBag;
      const base = totalKg * parseFloat(p.ratePerKg);
      const gst = base * parseFloat(p.gstPct) / 100;
      const grand = base + gst + parseFloat(p.transport);

      totalPurchaseBase += base;
      totalPurchaseGst += gst;
      totalPurchaseGrand += grand;
      totalPurchasePaid += parseFloat(p.amountPaid);
      totalPurchaseTransport += parseFloat(p.transport);

      if (!productPurchases[p.productId]) {
        productPurchases[p.productId] = { totalBase: 0, totalKg: 0 };
      }
      productPurchases[p.productId].totalBase += base;
      productPurchases[p.productId].totalKg += totalKg;
    }

    // 4. Sales aggregation
    const allSales = await ctx.db.select().from(sales)
      .where(and(eq(sales.tenantId, tid), isNull(sales.deletedAt)));

    let totalSaleBase = 0;
    let totalSaleGst = 0;
    let totalSaleInclGst = 0;
    let totalSaleReceived = 0;
    let totalSaleTransport = 0;
    let totalCogs = 0;
    let totalBrokerCommission = 0;
    const salesCount = allSales.length;
    let pendingSaleCollections = 0;

    for (const s of allSales) {
      const totalKg = s.qtyBags * s.kgPerBag;
      const base = totalKg * parseFloat(s.ratePerKg);
      const gst = base * parseFloat(s.gstPct) / 100;
      const inclGst = base + gst;

      totalSaleBase += base;
      totalSaleGst += gst;
      totalSaleInclGst += inclGst;
      totalSaleReceived += parseFloat(s.amountReceived);
      totalSaleTransport += parseFloat(s.transport);

      // COGS using weighted average
      const pp = productPurchases[s.productId];
      const avgCost = pp && pp.totalKg > 0 ? pp.totalBase / pp.totalKg : 0;
      totalCogs += avgCost * totalKg;

      // Broker commission
      if (s.viaBroker && s.brokerId) {
        const broker = await ctx.db.select().from(contacts).where(eq(contacts.id, s.brokerId)).then(r => r[0]);
        if (broker) {
          if (broker.brokerCommissionType === "per_bag") {
            totalBrokerCommission += s.qtyBags * parseFloat(broker.brokerCommissionValue ?? "0");
          } else if (broker.brokerCommissionType === "percentage") {
            totalBrokerCommission += base * parseFloat(broker.brokerCommissionValue ?? "0") / 100;
          }
        }
      }
    }

    // 5. Payments aggregation
    const allPayments = await ctx.db.select().from(payments)
      .where(and(eq(payments.tenantId, tid), isNull(payments.deletedAt)));

    let totalPaymentsPaid = 0;
    let totalPaymentsReceived = 0;
    let totalBrokerPaid = 0;

    for (const pay of allPayments) {
      if (pay.direction === "Paid") {
        totalPaymentsPaid += parseFloat(pay.amount);
        const party = await ctx.db.select().from(contacts).where(eq(contacts.id, pay.partyId)).then(r => r[0]);
        if (party?.type === "Broker") {
          totalBrokerPaid += parseFloat(pay.amount);
        }
      } else {
        totalPaymentsReceived += parseFloat(pay.amount);
      }
    }

    // Compute payables and receivables
    const totalPayables = totalPurchaseGrand - totalPurchasePaid - totalPaymentsPaid + totalBrokerPaid;
    const totalReceivables = totalSaleInclGst - totalSaleReceived - totalPaymentsReceived;

    // Count pending
    pendingPurchasePayments = allPurchases.filter(p => {
      const totalKg = p.qtyBags * p.kgPerBag;
      const base = totalKg * parseFloat(p.ratePerKg);
      const gst = base * parseFloat(p.gstPct) / 100;
      const grand = base + gst + parseFloat(p.transport);
      return parseFloat(p.amountPaid) < grand;
    }).length;

    pendingSaleCollections = allSales.filter(s => {
      const totalKg = s.qtyBags * s.kgPerBag;
      const base = totalKg * parseFloat(s.ratePerKg);
      const gst = base * parseFloat(s.gstPct) / 100;
      const inclGst = base + gst;
      return parseFloat(s.amountReceived) < inclGst;
    }).length;

    // Cash in inventory
    const cashInInventory = totalPurchaseBase - totalCogs;

    // GST
    const netGst = totalSaleGst - totalPurchaseGst;
    const itcAvailable = netGst < 0 ? Math.abs(netGst) : 0;

    // Margins
    const grossMargin = totalSaleBase - totalCogs - totalSaleTransport - totalBrokerCommission;
    const grossMarginPct = totalSaleBase > 0 ? (grossMargin / totalSaleBase) * 100 : 0;
    const netMargin = grossMargin - actualInterest;
    const netMarginPct = totalSaleBase > 0 ? (netMargin / totalSaleBase) * 100 : 0;

    // Broker commission pending
    const brokerCommissionPending = totalBrokerCommission - totalBrokerPaid;

    // 6. Inventory per product
    const allProducts = await ctx.db.select().from(products)
      .where(and(eq(products.tenantId, tid), isNull(products.deletedAt)));

    const inventory = allProducts.map(prod => {
      const purchasedBags = allPurchases.filter(p => p.productId === prod.id).reduce((s, p) => s + p.qtyBags, 0);
      const purchasedKg = allPurchases.filter(p => p.productId === prod.id).reduce((s, p) => s + p.qtyBags * p.kgPerBag, 0);
      const soldBags = allSales.filter(s => s.productId === prod.id).reduce((acc, s) => acc + s.qtyBags, 0);
      const soldKg = allSales.filter(s => s.productId === prod.id).reduce((acc, s) => acc + s.qtyBags * s.kgPerBag, 0);
      return {
        productName: `${prod.millBrand} ${prod.fibreType} ${prod.count} ${prod.qualityGrade}`,
        bagsInHand: purchasedBags - soldBags,
        kgInHand: purchasedKg - soldKg,
      };
    }).filter(i => i.bagsInHand > 0);

    return {
      cc: {
        limit: ccLimit,
        outstanding: ccBalance,
        available: ccAvailable,
        utilizationPct: Math.round(ccUtilization * 100) / 100,
        calculatedInterest: Math.round(calcInterest * 100) / 100,
        actualInterest: Math.round(actualInterest * 100) / 100,
        difference: Math.round((calcInterest - actualInterest) * 100) / 100,
      },
      money: {
        cashInInventory: Math.round(cashInInventory * 100) / 100,
        totalReceivables: Math.round(totalReceivables * 100) / 100,
        totalPayables: Math.round(Math.max(0, totalPayables) * 100) / 100,
        brokerPending: Math.round(Math.max(0, brokerCommissionPending) * 100) / 100,
        totalTransport: Math.round((totalPurchaseTransport + totalSaleTransport) * 100) / 100,
      },
      gst: {
        outputGst: Math.round(totalSaleGst * 100) / 100,
        inputGst: Math.round(totalPurchaseGst * 100) / 100,
        netPayable: Math.round(netGst * 100) / 100,
        itcAvailable: Math.round(itcAvailable * 100) / 100,
      },
      margins: {
        revenue: Math.round(totalSaleBase * 100) / 100,
        cogs: Math.round(totalCogs * 100) / 100,
        transport: Math.round(totalSaleTransport * 100) / 100,
        brokerCommission: Math.round(totalBrokerCommission * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        grossMarginPct: Math.round(grossMarginPct * 100) / 100,
        ccInterest: Math.round(actualInterest * 100) / 100,
        netMargin: Math.round(netMargin * 100) / 100,
        netMarginPct: Math.round(netMarginPct * 100) / 100,
      },
      inventory,
      stats: {
        totalPurchases: purchaseCount,
        totalSales: salesCount,
        pendingPayments: pendingPurchasePayments,
        pendingCollections: pendingSaleCollections,
      },
    };
  }),
});
