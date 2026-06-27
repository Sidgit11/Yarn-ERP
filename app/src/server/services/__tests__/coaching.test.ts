import { describe, it, expect } from "vitest";
import {
  FLOOR_BUFFER_PP,
  minRatePerKg,
  resolveFloor,
  computeBusinessAvgMargin,
  marginPctOf,
  findUnderpricedSales,
  buyerScorecard,
  type CoachingSale,
} from "../coaching";

// Build a CoachingSale with sensible defaults.
function cs(o: Partial<CoachingSale> & { id: string }): CoachingSale {
  return {
    displayId: o.id,
    productId: "prod-1",
    buyerId: "buyer-1",
    buyerName: "Buyer 1",
    date: "2026-01-01",
    revenue: 100000,
    cogs: 96000,
    totalKg: 1000,
    uncostedBags: 0,
    ...o,
  };
}

describe("minRatePerKg", () => {
  it("returns cost divided by (1 - floor)", () => {
    // cost 300/kg, floor 4% -> 300/0.96 = 312.5
    expect(minRatePerKg(300, 4)).toBeCloseTo(312.5, 4);
  });
  it("equals cost when floor is 0", () => {
    expect(minRatePerKg(300, 0)).toBeCloseTo(300, 4);
  });
});

describe("resolveFloor", () => {
  it("uses product override when present", () => {
    expect(resolveFloor({ productOverride: 6, globalOverride: 5, businessAvgPct: 3 })).toBe(6);
  });
  it("falls back to global override when product missing", () => {
    expect(resolveFloor({ productOverride: null, globalOverride: 5, businessAvgPct: 3 })).toBe(5);
  });
  it("falls back to auto (avg + buffer) when both missing", () => {
    expect(resolveFloor({ businessAvgPct: 3 })).toBe(3 + FLOOR_BUFFER_PP);
  });
  it("treats an explicit 0 override as a real value, not missing", () => {
    expect(resolveFloor({ productOverride: 0, globalOverride: 5, businessAvgPct: 3 })).toBe(0);
  });
});

describe("computeBusinessAvgMargin", () => {
  it("is volume-weighted, not a mean of percentages", () => {
    // Sale A: rev 100000 margin 1000 (1%). Sale B: rev 900000 margin 90000 (10%).
    // Weighted = 91000/1000000 = 9.1%. Mean-of-pct would be 5.5%.
    const sales = [
      cs({ id: "A", revenue: 100000, cogs: 99000 }),
      cs({ id: "B", revenue: 900000, cogs: 810000 }),
    ];
    expect(computeBusinessAvgMargin(sales)).toBeCloseTo(9.1, 4);
  });
  it("excludes uncosted sales and returns 0 when no costed revenue", () => {
    const sales = [cs({ id: "U", uncostedBags: 5 })];
    expect(computeBusinessAvgMargin(sales)).toBe(0);
  });
});

describe("marginPctOf", () => {
  it("computes margin over revenue", () => {
    expect(marginPctOf(cs({ id: "X", revenue: 100000, cogs: 96000 }))).toBeCloseTo(4, 4);
  });
  it("returns 0 for zero revenue", () => {
    expect(marginPctOf(cs({ id: "Z", revenue: 0, cogs: 0 }))).toBe(0);
  });
});

describe("findUnderpricedSales", () => {
  const floor4 = () => 4; // 4% floor for every product

  it("flags a sale below floor with money left on table and min rate", () => {
    // rev 100000, cogs 99000 -> margin 1% < 4%. totalKg 1000 -> cost/kg 99.
    // revenueAtFloor = 99000/0.96 = 103125 -> left = 3125. minRate = 99/0.96 = 103.125
    const sales = [cs({ id: "S1", revenue: 100000, cogs: 99000, totalKg: 1000 })];
    const [r] = findUnderpricedSales(sales, floor4);
    expect(r.saleId).toBe("S1");
    expect(r.moneyLeftOnTable).toBeCloseTo(3125, 2);
    expect(r.minRatePerKg).toBeCloseTo(103.125, 3);
    expect(r.marginPct).toBeCloseTo(1, 4);
    expect(r.floorPct).toBe(4);
  });

  it("does not flag a sale at or above floor", () => {
    // margin exactly 4%
    const sales = [cs({ id: "OK", revenue: 100000, cogs: 96000, totalKg: 1000 })];
    expect(findUnderpricedSales(sales, floor4)).toHaveLength(0);
  });

  it("excludes uncosted sales from the result", () => {
    const sales = [cs({ id: "U", revenue: 100000, cogs: 10000, uncostedBags: 3 })];
    expect(findUnderpricedSales(sales, floor4)).toHaveLength(0);
  });

  it("ranks by money left on table, biggest first", () => {
    const sales = [
      cs({ id: "small", revenue: 100000, cogs: 99000, totalKg: 1000 }),
      cs({ id: "big", revenue: 1000000, cogs: 990000, totalKg: 10000 }),
    ];
    const r = findUnderpricedSales(sales, floor4);
    expect(r.map((x) => x.saleId)).toEqual(["big", "small"]);
  });
});

describe("buyerScorecard", () => {
  it("flags a below-average buyer with the right money at stake", () => {
    // Business avg 4%. Buyer "squeeze": two sales, each rev 100000 margin 1000 => 1%.
    // gap 3pp, totalRev 200000 -> moneyAtStake = 0.03 * 200000 = 6000.
    const sales = [
      cs({ id: "a", buyerId: "squeeze", buyerName: "Squeeze", revenue: 100000, cogs: 99000 }),
      cs({ id: "b", buyerId: "squeeze", buyerName: "Squeeze", revenue: 100000, cogs: 99000 }),
    ];
    const [r] = buyerScorecard(sales, 4);
    expect(r.buyerId).toBe("squeeze");
    expect(r.weightedMarginPct).toBeCloseTo(1, 4);
    expect(r.gapPct).toBeCloseTo(3, 4);
    expect(r.moneyAtStake).toBeCloseTo(6000, 2);
  });

  it("excludes buyers at or above the business average", () => {
    const sales = [
      cs({ id: "a", buyerId: "good", revenue: 100000, cogs: 90000 }),
      cs({ id: "b", buyerId: "good", revenue: 100000, cogs: 90000 }),
    ];
    expect(buyerScorecard(sales, 4)).toHaveLength(0); // 10% > 4%
  });

  it("excludes buyers below the minimum sale count", () => {
    const sales = [cs({ id: "a", buyerId: "oneoff", revenue: 100000, cogs: 99000 })];
    expect(buyerScorecard(sales, 4)).toHaveLength(0);
  });

  it("ranks by money at stake", () => {
    const sales = [
      cs({ id: "a", buyerId: "small", revenue: 100000, cogs: 99000 }),
      cs({ id: "b", buyerId: "small", revenue: 100000, cogs: 99000 }),
      cs({ id: "c", buyerId: "big", revenue: 1000000, cogs: 990000 }),
      cs({ id: "d", buyerId: "big", revenue: 1000000, cogs: 990000 }),
    ];
    expect(buyerScorecard(sales, 4).map((x) => x.buyerId)).toEqual(["big", "small"]);
  });
});

import { agingLots, type RemainingLot } from "../coaching";

function lot(o: Partial<RemainingLot> & { purchaseId: string }): RemainingLot {
  return {
    productId: "prod-1",
    productName: "30s Cotton",
    purchaseDisplayId: o.purchaseId,
    purchaseDate: "2026-01-01",
    remainingBags: 10,
    costPerBag: 18000,
    ...o,
  };
}

describe("agingLots", () => {
  const today = "2026-06-26";

  it("flags a lot older than the threshold with age and capital tied", () => {
    // 2026-01-01 -> 2026-06-26 is 176 days. capital = 10 * 18000 = 180000.
    const [r] = agingLots([lot({ purchaseId: "P1" })], today);
    expect(r.purchaseId).toBe("P1");
    expect(r.ageDays).toBe(176);
    expect(r.capitalTied).toBe(180000);
  });

  it("excludes lots younger than the threshold", () => {
    // 30 days old < 60
    const recent = lot({ purchaseId: "P2", purchaseDate: "2026-05-27" });
    expect(agingLots([recent], today)).toHaveLength(0);
  });

  it("excludes lots with no remaining bags", () => {
    expect(agingLots([lot({ purchaseId: "P3", remainingBags: 0 })], today)).toHaveLength(0);
  });

  it("ranks by capital tied times age", () => {
    const lots = [
      lot({ purchaseId: "small", remainingBags: 1, costPerBag: 1000 }),
      lot({ purchaseId: "big", remainingBags: 50, costPerBag: 20000 }),
    ];
    expect(agingLots(lots, today).map((x) => x.purchaseId)).toEqual(["big", "small"]);
  });
});

import { marginTrend } from "../coaching";

describe("marginTrend", () => {
  const names = new Map([["prod-1", "30s Cotton"], ["prod-2", "40s Combed"]]);

  it("flags a product whose margin slipped across halves", () => {
    // 4 months: front (Jan,Feb) ~10%, back (Mar,Apr) ~2%. drop 8pp.
    const sales = [
      cs({ id: "1", productId: "prod-1", date: "2026-01-10", revenue: 100000, cogs: 90000 }),
      cs({ id: "2", productId: "prod-1", date: "2026-02-10", revenue: 100000, cogs: 90000 }),
      cs({ id: "3", productId: "prod-1", date: "2026-03-10", revenue: 100000, cogs: 98000 }),
      cs({ id: "4", productId: "prod-1", date: "2026-04-10", revenue: 100000, cogs: 98000 }),
    ];
    const [r] = marginTrend(sales, names);
    expect(r.productId).toBe("prod-1");
    expect(r.baselineMarginPct).toBeCloseTo(10, 4);
    expect(r.recentMarginPct).toBeCloseTo(2, 4);
    expect(r.dropPp).toBeCloseTo(8, 4);
    expect(r.months).toHaveLength(4);
  });

  it("does not flag a stable product", () => {
    const sales = [
      cs({ id: "1", productId: "prod-2", date: "2026-01-10", revenue: 100000, cogs: 95000 }),
      cs({ id: "2", productId: "prod-2", date: "2026-04-10", revenue: 100000, cogs: 95000 }),
    ];
    expect(marginTrend(sales, names)).toHaveLength(0);
  });

  it("skips products with only one month of data", () => {
    const sales = [
      cs({ id: "1", productId: "prod-1", date: "2026-01-10", revenue: 100000, cogs: 90000 }),
      cs({ id: "2", productId: "prod-1", date: "2026-01-20", revenue: 100000, cogs: 99000 }),
    ];
    expect(marginTrend(sales, names)).toHaveLength(0);
  });
});
