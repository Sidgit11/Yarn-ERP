import { router, protectedProcedure } from "../trpc";
import {
  purchases, sales, payments, ccEntries, config, ccInterestMonthly, contacts, products,
} from "../../db/schema";
import { eq, and, isNull, asc, inArray } from "drizzle-orm";
import {
  computePurchaseTotals,
  computeSaleTotals,
  computeBrokerCommission,
  computeCcInterest,
  productFullName,
  D,
  toMoney,
} from "../../services/calculations";

export const dashboardRouter = router({
  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.tenantId;
    const t0 = performance.now();

    // Parallel-load all data in 7 queries (not N+1)
    const [cfg, ccEntriesAll, monthlyInterest, allPurchases, allSales, allPayments, allProducts] =
      await Promise.all([
        ctx.db.select().from(config).where(eq(config.tenantId, tid)).then((r: any[]) => r[0]),
        ctx.db.select().from(ccEntries).where(eq(ccEntries.tenantId, tid))
          .orderBy(asc(ccEntries.date), asc(ccEntries.createdAt)),
        ctx.db.select().from(ccInterestMonthly).where(eq(ccInterestMonthly.tenantId, tid)),
        ctx.db.select().from(purchases)
          .where(and(eq(purchases.tenantId, tid), isNull(purchases.deletedAt))),
        ctx.db.select().from(sales)
          .where(and(eq(sales.tenantId, tid), isNull(sales.deletedAt))),
        ctx.db.select().from(payments)
          .where(and(eq(payments.tenantId, tid), isNull(payments.deletedAt))),
        ctx.db.select().from(products)
          .where(and(eq(products.tenantId, tid), isNull(products.deletedAt))),
      ]);
    const t1 = performance.now();
    console.log(`[dashboard] DB parallel load — ${(t1 - t0).toFixed(1)}ms (rows: ${allPurchases.length}P, ${allSales.length}S, ${allPayments.length}Pay, ${ccEntriesAll.length}CC, ${allProducts.length}Prod)`);

    // ── CC Position ───────────────────────────────────────────────────────
    const ccLimit = cfg ? parseFloat(cfg.ccLimit) : 5000000;
    const ccRate = cfg ? parseFloat(cfg.ccInterestRate) : 11;
    const ccBalance = ccEntriesAll.length > 0
      ? parseFloat(ccEntriesAll[ccEntriesAll.length - 1].runningBalance) : 0;
    const { total: calcInterest } = computeCcInterest(ccEntriesAll, ccRate);
    const actualInterest = monthlyInterest.reduce(
      (s: number, r: any) => s + parseFloat(r.actualInterest), 0
    );

    // ── Purchase aggregation (using shared calculation) ───────────────────
    let totalPurchaseBase = D(0);
    let totalPurchaseGst = D(0);
    let totalPurchaseGrand = D(0);
    let totalPurchasePaid = D(0);
    let totalPurchaseTransport = D(0);
    const productPurchases: Record<string, { totalBase: number; totalKg: number }> = {};

    for (const p of allPurchases) {
      const t = computePurchaseTotals(p);
      totalPurchaseBase = totalPurchaseBase.plus(t.baseAmount);
      totalPurchaseGst = totalPurchaseGst.plus(t.gstAmount);
      totalPurchaseGrand = totalPurchaseGrand.plus(t.grandTotal);
      totalPurchasePaid = totalPurchasePaid.plus(D(p.amountPaid));
      totalPurchaseTransport = totalPurchaseTransport.plus(D(p.transport));

      if (!productPurchases[p.productId]) {
        productPurchases[p.productId] = { totalBase: 0, totalKg: 0 };
      }
      productPurchases[p.productId].totalBase += t.baseAmount;
      productPurchases[p.productId].totalKg += t.totalKg;
    }

    // ── Batch-load broker contacts for sales (1 query, not N) ─────────────
    const brokerIds = [...new Set(
      allSales.filter((s) => s.viaBroker && s.brokerId).map((s) => s.brokerId!)
    )];
    let brokerMap = new Map<string, any>();
    if (brokerIds.length > 0) {
      const brokerRows = await ctx.db.select().from(contacts)
        .where(and(inArray(contacts.id, brokerIds), eq(contacts.tenantId, tid)));
      brokerMap = new Map(brokerRows.map((r: any) => [r.id, r]));
    }
    console.log(`[dashboard] Broker batch load — ${(performance.now() - t1).toFixed(1)}ms`);

    // ── Sale aggregation ──────────────────────────────────────────────────
    let totalSaleBase = D(0);
    let totalSaleGst = D(0);
    let totalSaleInclGst = D(0);
    let totalSaleReceived = D(0);
    let totalSaleTransport = D(0);
    let totalCogs = D(0);
    let totalBrokerCommission = D(0);

    for (const s of allSales) {
      const t = computeSaleTotals(s);
      totalSaleBase = totalSaleBase.plus(t.baseAmount);
      totalSaleGst = totalSaleGst.plus(t.gstAmount);
      totalSaleInclGst = totalSaleInclGst.plus(t.totalInclGst);
      totalSaleReceived = totalSaleReceived.plus(D(s.amountReceived));
      totalSaleTransport = totalSaleTransport.plus(D(s.transport));

      // COGS using weighted average
      const pp = productPurchases[s.productId];
      const avgCost = pp && pp.totalKg > 0 ? pp.totalBase / pp.totalKg : 0;
      totalCogs = totalCogs.plus(D(avgCost).mul(t.totalKg));

      // Broker commission
      if (s.viaBroker && s.brokerId) {
        const broker = brokerMap.get(s.brokerId);
        if (broker) {
          totalBrokerCommission = totalBrokerCommission.plus(
            computeBrokerCommission(
              broker.brokerCommissionType,
              broker.brokerCommissionValue,
              s.qtyBags,
              t.baseAmount
            )
          );
        }
      }
    }

    // ── Payment aggregation ───────────────────────────────────────────────
    // Batch-load party contacts for payments (1 query, not N)
    const paymentPartyIds = [...new Set(allPayments.map((p) => p.partyId))];
    let partyMap = new Map<string, any>();
    if (paymentPartyIds.length > 0) {
      const partyRows = await ctx.db.select().from(contacts)
        .where(and(inArray(contacts.id, paymentPartyIds), eq(contacts.tenantId, tid)));
      partyMap = new Map(partyRows.map((r: any) => [r.id, r]));
    }
    const t2 = performance.now();
    console.log(`[dashboard] Party batch load — ${(t2 - t1).toFixed(1)}ms`);

    let totalPaymentsPaid = D(0);
    let totalPaymentsReceived = D(0);
    let totalBrokerPaid = D(0);

    for (const pay of allPayments) {
      if (pay.direction === "Paid") {
        totalPaymentsPaid = totalPaymentsPaid.plus(D(pay.amount));
        const party = partyMap.get(pay.partyId);
        if (party?.type === "Broker") {
          totalBrokerPaid = totalBrokerPaid.plus(D(pay.amount));
        }
      } else {
        totalPaymentsReceived = totalPaymentsReceived.plus(D(pay.amount));
      }
    }

    // ── Derived metrics ───────────────────────────────────────────────────
    const totalPayables = totalPurchaseGrand.minus(totalPurchasePaid).minus(totalPaymentsPaid).plus(totalBrokerPaid);
    const totalReceivables = totalSaleInclGst.minus(totalSaleReceived).minus(totalPaymentsReceived);

    // Build linked payments map by againstTxnId for pending count calculation
    const linkedPaymentsByTxn: Record<string, number> = {};
    for (const pay of allPayments) {
      if (pay.againstTxnId) {
        linkedPaymentsByTxn[pay.againstTxnId] = (linkedPaymentsByTxn[pay.againstTxnId] ?? 0) + parseFloat(pay.amount);
      }
    }

    // Pending counts: purchases/sales where linked payments don't cover the full amount.
    // We also distribute unlinked payments across the oldest unpaid transactions so the
    // count stays consistent with the "You Owe Them" / "They Owe You" totals.

    // Purchase pending count
    let unlinkedPaidPool = D(0);
    for (const pay of allPayments) {
      if (pay.direction === "Paid" && !pay.againstTxnId) {
        unlinkedPaidPool = unlinkedPaidPool.plus(D(pay.amount));
      }
    }
    // Sort purchases by date (oldest first) so unlinked payments settle oldest first
    const sortedPurchases = [...allPurchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let pendingPurchasePayments = 0;
    for (const p of sortedPurchases) {
      const t = computePurchaseTotals(p);
      const linked = D(p.amountPaid).plus(linkedPaymentsByTxn[p.displayId] ?? 0);
      let remaining = D(t.grandTotal).minus(linked);
      if (remaining.gt(0) && unlinkedPaidPool.gt(0)) {
        const apply = remaining.lt(unlinkedPaidPool) ? remaining : unlinkedPaidPool;
        remaining = remaining.minus(apply);
        unlinkedPaidPool = unlinkedPaidPool.minus(apply);
      }
      if (remaining.gt(0)) pendingPurchasePayments++;
    }

    // Sale pending count
    let unlinkedReceivedPool = D(0);
    for (const pay of allPayments) {
      if (pay.direction === "Received" && !pay.againstTxnId) {
        unlinkedReceivedPool = unlinkedReceivedPool.plus(D(pay.amount));
      }
    }
    const sortedSales = [...allSales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let pendingSaleCollections = 0;
    for (const s of sortedSales) {
      const t = computeSaleTotals(s);
      const linked = D(s.amountReceived).plus(linkedPaymentsByTxn[s.displayId] ?? 0);
      let remaining = D(t.totalInclGst).minus(linked);
      if (remaining.gt(0) && unlinkedReceivedPool.gt(0)) {
        const apply = remaining.lt(unlinkedReceivedPool) ? remaining : unlinkedReceivedPool;
        remaining = remaining.minus(apply);
        unlinkedReceivedPool = unlinkedReceivedPool.minus(apply);
      }
      if (remaining.gt(0)) pendingSaleCollections++;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueCollections = allSales.filter((s) => {
      if (!s.dueDate) return false;
      const t = computeSaleTotals(s);
      const totalReceived = D(s.amountReceived).plus(linkedPaymentsByTxn[s.displayId] ?? 0);
      if (!totalReceived.lt(t.totalInclGst)) return false; // already paid
      const due = new Date(s.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today;
    }).length;

    const cashInInventory = totalPurchaseBase.minus(totalCogs);
    const netGst = totalSaleGst.minus(totalPurchaseGst);
    const itcAvailable = netGst.lt(0) ? netGst.abs() : D(0);

    const grossMargin = totalSaleBase.minus(totalCogs).minus(totalSaleTransport).minus(totalBrokerCommission);
    const grossMarginPct = totalSaleBase.gt(0) ? grossMargin.div(totalSaleBase).mul(100) : D(0);
    const netMargin = grossMargin.minus(actualInterest);
    const netMarginPct = totalSaleBase.gt(0) ? netMargin.div(totalSaleBase).mul(100) : D(0);
    const brokerCommissionPending = totalBrokerCommission.minus(totalBrokerPaid);

    // ── Inventory per product (indexed for O(N) instead of O(P*M)) ────────
    const purchasesByProduct: Record<string, { bags: number; kg: number }> = {};
    for (const p of allPurchases) {
      if (!purchasesByProduct[p.productId]) purchasesByProduct[p.productId] = { bags: 0, kg: 0 };
      purchasesByProduct[p.productId].bags += p.qtyBags;
      purchasesByProduct[p.productId].kg += p.qtyBags * Number(p.kgPerBag);
    }
    const salesByProduct: Record<string, { bags: number; kg: number }> = {};
    for (const s of allSales) {
      if (!salesByProduct[s.productId]) salesByProduct[s.productId] = { bags: 0, kg: 0 };
      salesByProduct[s.productId].bags += s.qtyBags;
      salesByProduct[s.productId].kg += s.qtyBags * Number(s.kgPerBag);
    }
    const inventory = allProducts.map((prod) => {
      const bought = purchasesByProduct[prod.id] ?? { bags: 0, kg: 0 };
      const sold = salesByProduct[prod.id] ?? { bags: 0, kg: 0 };
      return {
        productName: productFullName(prod),
        bagsInHand: bought.bags - sold.bags,
        kgInHand: bought.kg - sold.kg,
      };
    }).filter((i) => i.bagsInHand > 0);

    // ── CC Money Trail: where is the CC money sitting? ─────────────────
    const ccMoneyTrail = {
      stockAtCost: toMoney(cashInInventory),
      soldAtCost: toMoney(totalCogs),
      gstPaid: toMoney(totalPurchaseGst),
      transport: toMoney(totalPurchaseTransport),
      overpaidToMills: toMoney(Decimal_max(totalPaymentsPaid.minus(totalBrokerPaid).minus(totalPurchaseGrand), D(0))),
    };

    console.log(`[dashboard] Logic/computation — ${(performance.now() - t2).toFixed(1)}ms`);
    console.log(`[dashboard] Total — ${(performance.now() - t0).toFixed(1)}ms`);

    return {
      cc: {
        limit: ccLimit,
        outstanding: ccBalance,
        available: toMoney(D(ccLimit).minus(ccBalance)),
        utilizationPct: ccLimit > 0 ? toMoney(D(ccBalance).div(ccLimit).mul(100)) : 0,
        calculatedInterest: calcInterest,
        actualInterest: toMoney(D(actualInterest)),
        difference: toMoney(D(calcInterest).minus(actualInterest)),
        moneyTrail: ccMoneyTrail,
      },
      money: {
        cashInInventory: toMoney(cashInInventory),
        totalReceivables: toMoney(totalReceivables),
        totalPayables: toMoney(Decimal_max(totalPayables, D(0))),
        brokerPending: toMoney(Decimal_max(brokerCommissionPending, D(0))),
        totalTransport: toMoney(totalPurchaseTransport.plus(totalSaleTransport)),
      },
      gst: {
        outputGst: toMoney(totalSaleGst),
        inputGst: toMoney(totalPurchaseGst),
        netPayable: toMoney(netGst),
        itcAvailable: toMoney(itcAvailable),
      },
      margins: {
        revenue: toMoney(totalSaleBase),
        cogs: toMoney(totalCogs),
        transport: toMoney(totalSaleTransport),
        brokerCommission: toMoney(totalBrokerCommission),
        grossMargin: toMoney(grossMargin),
        grossMarginPct: toMoney(grossMarginPct),
        ccInterest: toMoney(D(actualInterest)),
        netMargin: toMoney(netMargin),
        netMarginPct: toMoney(netMarginPct),
      },
      inventory,
      stats: {
        totalPurchases: allPurchases.length,
        totalSales: allSales.length,
        pendingPayments: pendingPurchasePayments,
        pendingCollections: pendingSaleCollections,
        overdueCollections,
      },
    };
  }),
});

// Decimal doesn't have a static max
import Decimal from "decimal.js";
function Decimal_max(a: Decimal, b: Decimal): Decimal {
  return a.gte(b) ? a : b;
}
