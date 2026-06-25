import { z } from "zod";
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
import { computeSaleCosting, computeFifoInventoryValue } from "../../services/fifoCosting";

const dateRangeInput = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const dashboardRouter = router({
  getMetrics: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
    const tid = ctx.tenantId;
    const t0 = performance.now();
    // Period-metric filter: applied via .filter() inside the existing loops.
    // As-of metrics (CC, payables, receivables, stock-in-hand) ignore this.
    const rangeFrom = input?.from ?? null;
    const rangeTo = input?.to ?? null;
    const inRange = (dateIso: string): boolean => {
      if (rangeFrom && dateIso < rangeFrom) return false;
      if (rangeTo && dateIso > rangeTo) return false;
      return true;
    };

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

    // FIFO costing: per-sale COGS and per-product remaining inventory value.
    const fifoCosting = computeSaleCosting(allPurchases, allSales);
    const fifoInventory = computeFifoInventoryValue(allPurchases, allSales);

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
    // All-time totals (used by as-of payables/receivables/money-trail).
    let totalPurchaseBase = D(0);
    let totalPurchaseGst = D(0);
    let totalPurchaseGrand = D(0);
    let totalPurchasePaid = D(0);
    let totalPurchaseTransport = D(0);
    // Period totals (used by period margins/gst). Only differ when filter is active.
    let periodPurchaseBase = D(0);
    let periodPurchaseGst = D(0);
    let periodPurchaseTransport = D(0);
    let periodPurchasesCount = 0;

    for (const p of allPurchases) {
      const t = computePurchaseTotals(p);
      totalPurchaseBase = totalPurchaseBase.plus(t.baseAmount);
      totalPurchaseGst = totalPurchaseGst.plus(t.gstAmount);
      totalPurchaseGrand = totalPurchaseGrand.plus(t.grandTotal);
      totalPurchasePaid = totalPurchasePaid.plus(D(p.amountPaid));
      totalPurchaseTransport = totalPurchaseTransport.plus(D(p.transport));

      if (inRange(p.date)) {
        periodPurchaseBase = periodPurchaseBase.plus(t.baseAmount);
        periodPurchaseGst = periodPurchaseGst.plus(t.gstAmount);
        periodPurchaseTransport = periodPurchaseTransport.plus(D(p.transport));
        periodPurchasesCount++;
      }
    }

    // ── Batch-load broker contacts for sales + purchases (1 query, not N) ──
    const brokerIds = [...new Set([
      ...allSales.filter((s) => s.viaBroker && s.brokerId).map((s) => s.brokerId!),
      ...allPurchases.filter((p) => p.viaBroker && p.brokerId).map((p) => p.brokerId!),
    ])];
    let brokerMap = new Map<string, any>();
    if (brokerIds.length > 0) {
      const brokerRows = await ctx.db.select().from(contacts)
        .where(and(inArray(contacts.id, brokerIds), eq(contacts.tenantId, tid)));
      brokerMap = new Map(brokerRows.map((r: any) => [r.id, r]));
    }
    console.log(`[dashboard] Broker batch load — ${(performance.now() - t1).toFixed(1)}ms`);

    // ── Sale aggregation ──────────────────────────────────────────────────
    // All-time totals (used by as-of receivables).
    let totalSaleBase = D(0);
    let totalSaleGst = D(0);
    let totalSaleInclGst = D(0);
    let totalSaleReceived = D(0);
    let totalSaleTransport = D(0);
    let totalCogs = D(0);
    let totalBrokerCommission = D(0);
    // Period totals (used by period margins/gst/stats).
    let periodSaleBase = D(0);
    let periodSaleGst = D(0);
    let periodSaleTransport = D(0);
    let periodCogs = D(0);
    let periodSaleBrokerCommission = D(0);
    let periodSalesCount = 0;
    // Bags sold beyond available purchased stock (FIFO ran out) — surfaced as a
    // data-quality warning since their margin is overstated (no cost attributed).
    let periodUncostedBags = 0;

    for (const s of allSales) {
      const t = computeSaleTotals(s);
      totalSaleBase = totalSaleBase.plus(t.baseAmount);
      totalSaleGst = totalSaleGst.plus(t.gstAmount);
      totalSaleInclGst = totalSaleInclGst.plus(t.totalInclGst);
      totalSaleReceived = totalSaleReceived.plus(D(s.amountReceived));
      totalSaleTransport = totalSaleTransport.plus(D(s.transport));

      // COGS using FIFO (oldest purchase layers first)
      const saleCosting = fifoCosting.get(s.id);
      const cogs = D(saleCosting?.cogs ?? 0);
      const uncostedBags = saleCosting?.uncostedBags ?? 0;
      totalCogs = totalCogs.plus(cogs);

      // Broker commission
      let brokerCommission = D(0);
      if (s.viaBroker && s.brokerId) {
        const broker = brokerMap.get(s.brokerId);
        if (broker) {
          brokerCommission = D(computeBrokerCommission(
            broker.brokerCommissionType,
            broker.brokerCommissionValue,
            s.qtyBags,
            t.baseAmount
          ));
          totalBrokerCommission = totalBrokerCommission.plus(brokerCommission);
        }
      }

      if (inRange(s.date)) {
        periodSaleBase = periodSaleBase.plus(t.baseAmount);
        periodSaleGst = periodSaleGst.plus(t.gstAmount);
        periodSaleTransport = periodSaleTransport.plus(D(s.transport));
        periodCogs = periodCogs.plus(cogs);
        periodSaleBrokerCommission = periodSaleBrokerCommission.plus(brokerCommission);
        periodUncostedBags += uncostedBags;
        periodSalesCount++;
      }
    }

    // ── Purchase broker commission ──────────────────────────────────────────
    let totalPurchaseBrokerCommission = D(0);
    let periodPurchaseBrokerCommission = D(0);
    for (const p of allPurchases) {
      if (p.viaBroker && p.brokerId) {
        const broker = brokerMap.get(p.brokerId);
        if (broker) {
          const t = computePurchaseTotals(p);
          const commission = D(computeBrokerCommission(
            broker.brokerCommissionType,
            broker.brokerCommissionValue,
            p.qtyBags,
            t.baseAmount
          ));
          totalPurchaseBrokerCommission = totalPurchaseBrokerCommission.plus(commission);
          if (inRange(p.date)) {
            periodPurchaseBrokerCommission = periodPurchaseBrokerCommission.plus(commission);
          }
        }
      }
    }
    // Total broker commission = sales + purchases (all-time, for payables).
    totalBrokerCommission = totalBrokerCommission.plus(totalPurchaseBrokerCommission);
    // Period broker commission = sales + purchases within range (for period margins).
    const periodBrokerCommission = periodSaleBrokerCommission.plus(periodPurchaseBrokerCommission);

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
    // Break down payments by party type
    let paidToMills = D(0);
    let paidToBrokers = D(0);
    let paidToTransporters = D(0);
    for (const pay of allPayments) {
      if (pay.direction === "Paid") {
        const party = partyMap.get(pay.partyId);
        if (party?.type === "Mill") paidToMills = paidToMills.plus(D(pay.amount));
        else if (party?.type === "Broker") paidToBrokers = paidToBrokers.plus(D(pay.amount));
        else if (party?.type === "Transporter") paidToTransporters = paidToTransporters.plus(D(pay.amount));
      }
    }

    // Mill payables = purchase grand totals - amountPaid on purchases - payments to mills
    const millPayables = Decimal_max(totalPurchaseGrand.minus(totalPurchasePaid).minus(paidToMills), D(0));

    // Broker payables = total commission (sales + purchases) - payments to brokers
    const brokerCommissionPending = Decimal_max(totalBrokerCommission.minus(paidToBrokers), D(0));

    // Transporter payables = total transport on purchases/sales with transporters - payments to transporters
    let totalTransportBilled = D(0);
    for (const p of allPurchases) {
      if (p.transporterId && Number(p.transport) > 0) totalTransportBilled = totalTransportBilled.plus(D(p.transport));
    }
    for (const s of allSales) {
      if (s.transporterId && Number(s.transport) > 0) totalTransportBilled = totalTransportBilled.plus(D(s.transport));
    }
    const transporterPayables = Decimal_max(totalTransportBilled.minus(paidToTransporters), D(0));

    const totalPayables = millPayables.plus(brokerCommissionPending).plus(transporterPayables);
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

    // ── Inventory per product (indexed for O(N) instead of O(P*M)) ────────
    // Moved above cashInInventory to compute per-product stock value correctly
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
    const allInventory = allProducts.map((prod) => {
      const bought = purchasesByProduct[prod.id] ?? { bags: 0, kg: 0 };
      const sold = salesByProduct[prod.id] ?? { bags: 0, kg: 0 };
      return {
        productName: productFullName(prod),
        bagsInHand: bought.bags - sold.bags,
        kgInHand: bought.kg - sold.kg,
      };
    });
    const inventory = allInventory.filter((i) => i.bagsInHand > 0);
    const negativeInventory = allInventory.filter((i) => i.bagsInHand < 0);

    // cashInInventory = value of the un-consumed FIFO layers (newest stock on
    // hand). Reconciles with FIFO COGS: purchaseBase = soldAtCost + stockAtCost.
    // Never negative — oversold products contribute 0, not a negative value.
    let cashInInventory = D(0);
    for (const inv of fifoInventory.values()) {
      cashInInventory = cashInInventory.plus(inv.remainingValue);
    }

    // All-time net GST (used for money.gstNet — as-of position).
    const netGst = totalSaleGst.minus(totalPurchaseGst);
    const itcAvailable = netGst.lt(0) ? netGst.abs() : D(0);

    // Period margins (revenue/COGS/expenses/margin for the selected window).
    const periodGrossMargin = periodSaleBase
      .minus(periodCogs)
      .minus(periodSaleTransport)
      .minus(periodBrokerCommission);
    const periodGrossMarginPct = periodSaleBase.gt(0)
      ? periodGrossMargin.div(periodSaleBase).mul(100)
      : D(0);
    // CC interest is intrinsically as-of (running balance × rate), so when the
    // user filters by period we don't try to slice it — show 0 contribution.
    const periodNetMargin = periodGrossMargin; // no period-attributed interest in v1
    const periodNetMarginPct = periodSaleBase.gt(0)
      ? periodNetMargin.div(periodSaleBase).mul(100)
      : D(0);
    const periodNetGst = periodSaleGst.minus(periodPurchaseGst);

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
      // money.* is as-of: shows where money is sitting right now regardless of filter.
      money: {
        cashInInventory: toMoney(cashInInventory),
        totalReceivables: toMoney(totalReceivables),
        totalPayables: toMoney(Decimal_max(totalPayables, D(0))),
        millPayables: toMoney(millPayables),
        brokerPending: toMoney(brokerCommissionPending),
        transporterPending: toMoney(transporterPayables),
        expenses: toMoney(totalPurchaseTransport.plus(totalSaleTransport).plus(totalBrokerCommission)),
        gstNet: toMoney(totalPurchaseGst.minus(totalSaleGst)), // positive = ITC sitting with govt
        unrealizedProfit: toMoney(periodGrossMargin),
        totalTransport: toMoney(totalPurchaseTransport.plus(totalSaleTransport)),
      },
      // gst.* is period-shaped (monthly filing); when no filter, period == all-time.
      gst: {
        outputGst: toMoney(periodSaleGst),
        inputGst: toMoney(periodPurchaseGst),
        netPayable: toMoney(periodNetGst),
        itcAvailable: toMoney(itcAvailable),
      },
      // margins.* is period-shaped.
      margins: {
        revenue: toMoney(periodSaleBase),
        cogs: toMoney(periodCogs),
        transport: toMoney(periodSaleTransport),
        brokerCommission: toMoney(periodBrokerCommission),
        grossMargin: toMoney(periodGrossMargin),
        grossMarginPct: toMoney(periodGrossMarginPct),
        ccInterest: toMoney(D(actualInterest)),
        netMargin: toMoney(periodNetMargin),
        netMarginPct: toMoney(periodNetMarginPct),
        // > 0 means some sales drew on more bags than were purchased (FIFO ran
        // dry); their margin is overstated until the data is corrected.
        uncostedBags: periodUncostedBags,
      },
      inventory,
      negativeInventory,
      stats: {
        // Period counts (transactions in window). Pending* remain as-of.
        totalPurchases: periodPurchasesCount,
        totalSales: periodSalesCount,
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
