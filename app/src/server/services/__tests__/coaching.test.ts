import { describe, it, expect } from "vitest";
import {
  FLOOR_BUFFER_PP,
  minRatePerKg,
  resolveFloor,
  computeBusinessAvgMargin,
  marginPctOf,
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
