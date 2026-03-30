import { describe, it, expect } from "vitest";
import {
  D,
  toMoney,
  computePurchaseTotals,
  computeSaleTotals,
  computePurchaseBalance,
  computeSaleBalance,
  computeBrokerCommission,
  computeAvgCostPerKg,
  computeCcInterest,
  productFullName,
} from "../calculations";

describe("D (Decimal helper)", () => {
  it("handles null/undefined/empty", () => {
    expect(D(null).toNumber()).toBe(0);
    expect(D(undefined).toNumber()).toBe(0);
    expect(D("").toNumber()).toBe(0);
  });

  it("handles string numbers", () => {
    expect(D("150.75").toNumber()).toBe(150.75);
  });

  it("handles numbers", () => {
    expect(D(42).toNumber()).toBe(42);
  });
});

describe("computePurchaseTotals", () => {
  it("computes correctly for a standard purchase", () => {
    const result = computePurchaseTotals({
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: "150.00",
      gstPct: "5.00",
      transport: "5000.00",
    });

    expect(result.totalKg).toBe(2000);
    expect(result.baseAmount).toBe(300000); // 2000 * 150
    expect(result.gstAmount).toBe(15000); // 300000 * 5%
    expect(result.totalInclGst).toBe(315000); // 300000 + 15000
    expect(result.grandTotal).toBe(320000); // 315000 + 5000
  });

  it("handles zero transport", () => {
    const result = computePurchaseTotals({
      qtyBags: 10,
      kgPerBag: 50,
      ratePerKg: "200.00",
      gstPct: "12.00",
      transport: "0",
    });

    expect(result.totalKg).toBe(500);
    expect(result.baseAmount).toBe(100000);
    expect(result.gstAmount).toBe(12000);
    expect(result.grandTotal).toBe(112000);
  });

  it("avoids floating-point errors", () => {
    // Classic case: 0.1 + 0.2 !== 0.3 in JS
    const result = computePurchaseTotals({
      qtyBags: 3,
      kgPerBag: 1,
      ratePerKg: "0.10",
      gstPct: "0.00",
      transport: "0.20",
    });

    expect(result.baseAmount).toBe(0.3);
    expect(result.grandTotal).toBe(0.5);
  });
});

describe("computeSaleTotals", () => {
  it("computes correctly (no transport in total)", () => {
    const result = computeSaleTotals({
      qtyBags: 10,
      kgPerBag: 100,
      ratePerKg: "165.00",
      gstPct: "5.00",
    });

    expect(result.totalKg).toBe(1000);
    expect(result.baseAmount).toBe(165000);
    expect(result.gstAmount).toBe(8250);
    expect(result.totalInclGst).toBe(173250);
  });
});

describe("computePurchaseBalance", () => {
  it("returns Paid when fully paid", () => {
    const { balanceDue, status } = computePurchaseBalance(320000, "320000", 0);
    expect(balanceDue).toBe(0);
    expect(status).toBe("Paid");
  });

  it("returns Partial when partially paid", () => {
    const { balanceDue, status } = computePurchaseBalance(320000, "100000", 50000);
    expect(balanceDue).toBe(170000);
    expect(status).toBe("Partial");
  });

  it("returns Pending when nothing paid", () => {
    const { balanceDue, status } = computePurchaseBalance(320000, "0", 0);
    expect(balanceDue).toBe(320000);
    expect(status).toBe("Pending");
  });

  it("returns Paid when overpaid", () => {
    const { balanceDue, status } = computePurchaseBalance(100000, "120000", 0);
    expect(balanceDue).toBe(-20000);
    expect(status).toBe("Paid");
  });
});

describe("computeSaleBalance", () => {
  it("returns Received when fully received", () => {
    const { balanceReceivable, status } = computeSaleBalance(173250, "173250", 0);
    expect(balanceReceivable).toBe(0);
    expect(status).toBe("Received");
  });

  it("returns Partial when partially received", () => {
    const { balanceReceivable, status } = computeSaleBalance(173250, "50000", 23250);
    expect(balanceReceivable).toBe(100000);
    expect(status).toBe("Partial");
  });
});

describe("computeBrokerCommission", () => {
  it("calculates per_bag commission", () => {
    expect(computeBrokerCommission("per_bag", "5.00", 20, 300000)).toBe(100);
  });

  it("calculates percentage commission", () => {
    expect(computeBrokerCommission("percentage", "1.50", 20, 300000)).toBe(4500);
  });

  it("returns 0 for null type", () => {
    expect(computeBrokerCommission(null, null, 20, 300000)).toBe(0);
  });
});

describe("computeAvgCostPerKg", () => {
  it("computes weighted average", () => {
    // 2 purchases: 1000kg@150, 500kg@160 => avg = (150000+80000)/1500 = 153.33
    expect(computeAvgCostPerKg("230000", "1500")).toBe(153.33);
  });

  it("returns 0 for zero kg", () => {
    expect(computeAvgCostPerKg("0", "0")).toBe(0);
  });
});

describe("computeCcInterest", () => {
  it("calculates daily interest correctly", () => {
    const entries = [
      { date: "2026-01-01", runningBalance: "365000" },
    ];
    const endDate = new Date("2026-01-11"); // 10 days
    const result = computeCcInterest(entries, 10, endDate);
    // 365000 * 10 * 10 / 365 / 100 = 1000
    expect(result.total).toBe(1000);
    expect(result.perEntry).toHaveLength(1);
    expect(result.perEntry[0]).toBe(1000);
  });

  it("handles multiple entries", () => {
    const entries = [
      { date: "2026-01-01", runningBalance: "100000" },
      { date: "2026-01-11", runningBalance: "200000" },
    ];
    const endDate = new Date("2026-01-21"); // 10 + 10 days
    const result = computeCcInterest(entries, 10, endDate);
    // Entry 1: 100000 * 10 * 10 / 365 / 100 = 273.97
    // Entry 2: 200000 * 10 * 10 / 365 / 100 = 547.95
    expect(result.total).toBeCloseTo(821.92, 1);
  });
});

describe("productFullName", () => {
  it("concatenates product fields", () => {
    expect(
      productFullName({
        millBrand: "Vardhman",
        fibreType: "Polyester",
        count: "30s",
        qualityGrade: "Top",
      })
    ).toBe("Vardhman Polyester 30s Top");
  });
});
