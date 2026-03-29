import { describe, it, expect } from "vitest";

// Pure business logic functions - extract and test independently

describe("Purchase Computed Fields", () => {
  function computePurchase(input: {
    qtyBags: number;
    kgPerBag: number;
    ratePerKg: number;
    gstPct: number;
    transport: number;
    amountPaid: number;
    linkedPayments: number;
  }) {
    const totalKg = input.qtyBags * input.kgPerBag;
    const baseAmount = totalKg * input.ratePerKg;
    const gstAmount = (baseAmount * input.gstPct) / 100;
    const totalInclGst = baseAmount + gstAmount;
    const grandTotal = totalInclGst + input.transport;
    const balanceDue = grandTotal - input.amountPaid - input.linkedPayments;
    const status =
      balanceDue <= 0
        ? "Paid"
        : balanceDue < grandTotal
          ? "Partial"
          : "Pending";
    return {
      totalKg,
      baseAmount,
      gstAmount,
      totalInclGst,
      grandTotal,
      balanceDue,
      status,
    };
  }

  it("computes a standard purchase correctly", () => {
    const result = computePurchase({
      qtyBags: 50,
      kgPerBag: 100,
      ratePerKg: 200,
      gstPct: 5,
      transport: 5000,
      amountPaid: 0,
      linkedPayments: 0,
    });
    expect(result.totalKg).toBe(5000);
    expect(result.baseAmount).toBe(1000000); // 5000 * 200 = 10,00,000
    expect(result.gstAmount).toBe(50000); // 10,00,000 * 5% = 50,000
    expect(result.totalInclGst).toBe(1050000);
    expect(result.grandTotal).toBe(1055000); // 10,50,000 + 5,000
    expect(result.balanceDue).toBe(1055000);
    expect(result.status).toBe("Pending");
  });

  it("computes partial payment status", () => {
    const result = computePurchase({
      qtyBags: 50,
      kgPerBag: 100,
      ratePerKg: 200,
      gstPct: 5,
      transport: 5000,
      amountPaid: 500000,
      linkedPayments: 0,
    });
    expect(result.balanceDue).toBe(555000); // 10,55,000 - 5,00,000
    expect(result.status).toBe("Partial");
  });

  it("computes paid status when fully paid", () => {
    const result = computePurchase({
      qtyBags: 50,
      kgPerBag: 100,
      ratePerKg: 200,
      gstPct: 5,
      transport: 5000,
      amountPaid: 1055000,
      linkedPayments: 0,
    });
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("Paid");
  });

  it("handles paid via linked payments", () => {
    const result = computePurchase({
      qtyBags: 50,
      kgPerBag: 100,
      ratePerKg: 200,
      gstPct: 5,
      transport: 5000,
      amountPaid: 500000,
      linkedPayments: 555000,
    });
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe("Paid");
  });

  it("handles zero GST", () => {
    const result = computePurchase({
      qtyBags: 10,
      kgPerBag: 100,
      ratePerKg: 150,
      gstPct: 0,
      transport: 0,
      amountPaid: 0,
      linkedPayments: 0,
    });
    expect(result.gstAmount).toBe(0);
    expect(result.grandTotal).toBe(150000);
  });

  it("handles 18% GST", () => {
    const result = computePurchase({
      qtyBags: 10,
      kgPerBag: 100,
      ratePerKg: 100,
      gstPct: 18,
      transport: 0,
      amountPaid: 0,
      linkedPayments: 0,
    });
    expect(result.gstAmount).toBe(18000); // 1,00,000 * 18%
    expect(result.totalInclGst).toBe(118000);
  });
});

describe("Sale Computed Fields", () => {
  function computeSale(input: {
    qtyBags: number;
    kgPerBag: number;
    ratePerKg: number;
    gstPct: number;
    transport: number;
    amountReceived: number;
    linkedPayments: number;
    avgCostPerKg: number;
    brokerCommissionType?: "per_bag" | "percentage" | null;
    brokerCommissionValue?: number;
    viaBroker?: boolean;
  }) {
    const totalKg = input.qtyBags * input.kgPerBag;
    const baseAmount = totalKg * input.ratePerKg;
    const gstAmount = (baseAmount * input.gstPct) / 100;
    const totalInclGst = baseAmount + gstAmount;
    const cogs = input.avgCostPerKg * totalKg;

    let brokerCommission = 0;
    if (input.viaBroker) {
      if (input.brokerCommissionType === "per_bag") {
        brokerCommission =
          input.qtyBags * (input.brokerCommissionValue ?? 0);
      } else if (input.brokerCommissionType === "percentage") {
        brokerCommission =
          (baseAmount * (input.brokerCommissionValue ?? 0)) / 100;
      }
    }

    const grossMargin = baseAmount - cogs - input.transport - brokerCommission;
    const grossMarginPct =
      baseAmount > 0 ? (grossMargin / baseAmount) * 100 : 0;
    const balanceReceivable =
      totalInclGst - input.amountReceived - input.linkedPayments;
    const status =
      balanceReceivable <= 0
        ? "Received"
        : balanceReceivable < totalInclGst
          ? "Partial"
          : "Pending";

    return {
      totalKg,
      baseAmount,
      gstAmount,
      totalInclGst,
      cogs,
      brokerCommission,
      grossMargin,
      grossMarginPct,
      balanceReceivable,
      status,
    };
  }

  it("computes sale with profit margin", () => {
    const result = computeSale({
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: 220,
      gstPct: 5,
      transport: 2000,
      amountReceived: 0,
      linkedPayments: 0,
      avgCostPerKg: 200,
      viaBroker: false,
    });
    expect(result.totalKg).toBe(2000);
    expect(result.baseAmount).toBe(440000); // 2000 * 220
    expect(result.cogs).toBe(400000); // 2000 * 200
    expect(result.grossMargin).toBe(38000); // 4,40,000 - 4,00,000 - 2,000
    expect(result.grossMarginPct).toBeCloseTo(8.636, 1);
    expect(result.status).toBe("Pending");
  });

  it("computes broker commission per bag", () => {
    const result = computeSale({
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: 220,
      gstPct: 5,
      transport: 2000,
      amountReceived: 0,
      linkedPayments: 0,
      avgCostPerKg: 200,
      viaBroker: true,
      brokerCommissionType: "per_bag",
      brokerCommissionValue: 5,
    });
    expect(result.brokerCommission).toBe(100); // 20 bags * 5/bag
    expect(result.grossMargin).toBe(37900); // 38000 - 100
  });

  it("computes broker commission percentage", () => {
    const result = computeSale({
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: 220,
      gstPct: 5,
      transport: 0,
      amountReceived: 0,
      linkedPayments: 0,
      avgCostPerKg: 200,
      viaBroker: true,
      brokerCommissionType: "percentage",
      brokerCommissionValue: 2,
    });
    expect(result.brokerCommission).toBe(8800); // 4,40,000 * 2%
    expect(result.grossMargin).toBe(31200); // 40,000 - 8,800
  });

  it("handles negative margin (selling below cost)", () => {
    const result = computeSale({
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: 180,
      gstPct: 5,
      transport: 2000,
      amountReceived: 0,
      linkedPayments: 0,
      avgCostPerKg: 200,
      viaBroker: false,
    });
    expect(result.grossMargin).toBe(-42000); // 3,60,000 - 4,00,000 - 2,000
    expect(result.grossMarginPct).toBeLessThan(0);
  });

  it("computes received status", () => {
    const result = computeSale({
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: 220,
      gstPct: 5,
      transport: 0,
      amountReceived: 462000,
      linkedPayments: 0,
      avgCostPerKg: 200,
      viaBroker: false,
    });
    expect(result.balanceReceivable).toBe(0);
    expect(result.status).toBe("Received");
  });
});

describe("CC Interest Calculation", () => {
  function calculateCCInterest(
    entries: Array<{ date: string; runningBalance: number }>,
    annualRate: number,
    asOfDate: Date
  ) {
    let totalInterest = 0;
    for (let i = 0; i < entries.length; i++) {
      const nextDate =
        i < entries.length - 1
          ? new Date(entries[i + 1].date)
          : asOfDate;
      const thisDate = new Date(entries[i].date);
      const days = Math.max(
        0,
        Math.floor(
          (nextDate.getTime() - thisDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      totalInterest +=
        (entries[i].runningBalance * days * annualRate) / 365 / 100;
    }
    return Math.round(totalInterest * 100) / 100;
  }

  it("calculates interest for a single draw", () => {
    const entries = [{ date: "2026-03-01", runningBalance: 1000000 }];
    const asOf = new Date("2026-03-31");
    const interest = calculateCCInterest(entries, 11, asOf);
    // 10,00,000 * 30 days * 11% / 365 = 9,041.10
    expect(interest).toBeCloseTo(9041.1, 0);
  });

  it("calculates interest with draw + repay", () => {
    const entries = [
      { date: "2026-03-01", runningBalance: 1000000 },
      { date: "2026-03-16", runningBalance: 500000 },
    ];
    const asOf = new Date("2026-03-31");
    const interest = calculateCCInterest(entries, 11, asOf);
    // First 15 days: 10,00,000 * 15 * 11/365/100 = 4520.55
    // Next 15 days: 5,00,000 * 15 * 11/365/100 = 2260.27
    expect(interest).toBeCloseTo(6780.82, 0);
  });

  it("handles zero balance", () => {
    const entries = [{ date: "2026-03-01", runningBalance: 0 }];
    const interest = calculateCCInterest(
      entries,
      11,
      new Date("2026-03-31")
    );
    expect(interest).toBe(0);
  });
});

describe("Weighted Average Cost", () => {
  it("calculates weighted average from multiple purchases", () => {
    const purchases = [
      { qtyBags: 50, kgPerBag: 100, ratePerKg: 200 }, // 5000kg at 200
      { qtyBags: 30, kgPerBag: 100, ratePerKg: 220 }, // 3000kg at 220
    ];
    const totalBase = purchases.reduce(
      (s, p) => s + p.qtyBags * p.kgPerBag * p.ratePerKg,
      0
    );
    const totalKg = purchases.reduce(
      (s, p) => s + p.qtyBags * p.kgPerBag,
      0
    );
    const avgCost = totalBase / totalKg;

    // (10,00,000 + 6,60,000) / (5000 + 3000) = 16,60,000 / 8000 = 207.50
    expect(avgCost).toBe(207.5);
  });

  it("handles single purchase", () => {
    const totalBase = 50 * 100 * 200;
    const totalKg = 50 * 100;
    expect(totalBase / totalKg).toBe(200);
  });
});

describe("GST Position", () => {
  it("calculates net GST payable", () => {
    const outputGst = 22000; // from sales
    const inputGst = 50000; // from purchases
    const netPayable = outputGst - inputGst;
    const itcAvailable = netPayable < 0 ? Math.abs(netPayable) : 0;

    expect(netPayable).toBe(-28000);
    expect(itcAvailable).toBe(28000);
  });

  it("calculates positive net payable", () => {
    const outputGst = 50000;
    const inputGst = 22000;
    const netPayable = outputGst - inputGst;
    const itcAvailable = netPayable < 0 ? Math.abs(netPayable) : 0;

    expect(netPayable).toBe(28000);
    expect(itcAvailable).toBe(0);
  });
});

describe("Inventory Calculation", () => {
  it("computes bags and kg in hand", () => {
    const purchasedBags = 50 + 30; // 80 bags purchased
    const soldBags = 20; // 20 bags sold
    const purchasedKg = 50 * 100 + 30 * 100; // 8000 kg
    const soldKg = 20 * 100; // 2000 kg

    expect(purchasedBags - soldBags).toBe(60);
    expect(purchasedKg - soldKg).toBe(6000);
  });
});

describe("Balance & Status Logic", () => {
  function getStatus(
    balance: number,
    total: number,
    type: "purchase" | "sale"
  ) {
    if (type === "purchase") {
      return balance <= 0
        ? "Paid"
        : balance < total
          ? "Partial"
          : "Pending";
    }
    return balance <= 0
      ? "Received"
      : balance < total
        ? "Partial"
        : "Pending";
  }

  it("purchase: fully paid -> Paid", () => {
    expect(getStatus(0, 1055000, "purchase")).toBe("Paid");
  });

  it("purchase: overpaid -> Paid", () => {
    expect(getStatus(-5000, 1055000, "purchase")).toBe("Paid");
  });

  it("purchase: partial -> Partial", () => {
    expect(getStatus(555000, 1055000, "purchase")).toBe("Partial");
  });

  it("purchase: nothing paid -> Pending", () => {
    expect(getStatus(1055000, 1055000, "purchase")).toBe("Pending");
  });

  it("sale: fully received -> Received", () => {
    expect(getStatus(0, 462000, "sale")).toBe("Received");
  });

  it("sale: partial -> Partial", () => {
    expect(getStatus(162000, 462000, "sale")).toBe("Partial");
  });
});
