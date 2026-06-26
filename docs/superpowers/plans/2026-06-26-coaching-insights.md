# Coaching Insights Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a periodic-review "coaching" layer that surfaces four money-ranked insights — underpriced sales, buyer squeeze scorecard, aging stock, and margin-trend slipping — on a new `/insights` hub, each deep-linking to the place to act.

**Architecture:** Pure, fully-unit-tested service (`coaching.ts`) holds all logic and constants; a thin DB loader (`coachingDb.ts`) loads the tenant's history once, reuses the existing `computeFifoAllocations` FIFO engine for per-sale COGS and remaining lots, and feeds the pure functions; a `insights` tRPC router exposes one `getAll` query scoped by `ctx.tenantId`; a `/insights` page renders four ranked sections. The margin floor resolves per-product override → global override → auto default (business avg + buffer), all editable.

**Tech Stack:** Next.js 14 (App Router, route group `(dashboard)`), tRPC, Drizzle ORM, PostgreSQL (Supabase), decimal.js, Vitest, Tailwind, lucide-react.

## Global Constraints

- Money is `NUMERIC(14,2)` in Rupees (not paise). Percentages are actual values (`4.00` = 4%), not basis points.
- Money math uses `D()` (Decimal) and `toMoney()` (round 2dp → number) from `src/server/services/calculations.ts`.
- All endpoints scope by `ctx.tenantId` (DB holds multiple tenants; never query without it).
- Compute-on-the-fly — no new materialized/aggregate tables. Only two new **nullable** columns.
- FIFO ordering is date asc → createdAt asc → id asc (already encoded in `computeFifoAllocations`; do not reorder).
- Follow existing patterns: routers use `protectedProcedure`; DB loaders type `db` as `any` (matches `fifoCostingDb.ts`); service input types are plain shapes decoupled from Drizzle rows.
- Coaching never edits a transaction — read-only insight only.
- Named constants live in `coaching.ts` (single source of truth): `FLOOR_BUFFER_PP = 1.0`, `AGING_THRESHOLD_DAYS = 60`, `TREND_DROP_PP = 2.0`, `MIN_BUYER_SALES = 2`.
- Tests: `npm test` (vitest run) from `app/`. There is one **pre-existing** failing test (`computePurchaseBalance > returns Paid when overpaid`) unrelated to this work — do not try to fix it; just confirm your new tests pass and you introduce no new failures.

---

## File Structure

- `app/src/server/services/coaching.ts` — **create.** Pure logic + constants + types.
- `app/src/server/services/__tests__/coaching.test.ts` — **create.** Unit tests (TDD).
- `app/src/server/services/coachingDb.ts` — **create.** Thin DB loader.
- `app/src/server/trpc/routers/insights.ts` — **create.** `insightsRouter` with `getAll`.
- `app/src/server/trpc/routers/_app.ts` (or root router file) — **modify.** Register `insights` router.
- `app/src/server/db/schema.ts` — **modify.** Add `config.targetMarginFloorPct` and `products.marginFloorPct` (both nullable).
- `app/src/server/trpc/routers/config.ts` — **modify.** Persist `targetMarginFloorPct` in `update`.
- `app/src/server/trpc/routers/products.ts` — **modify.** Accept/persist `marginFloorPct` and return it in detail; expose `autoFloorPct` for display.
- `app/src/app/(dashboard)/settings/page.tsx` — **modify.** Global margin-floor field.
- `app/src/app/(dashboard)/products/page.tsx` — **modify.** Per-product margin-floor override field.
- `app/src/app/(dashboard)/insights/page.tsx` — **create.** The review hub.
- `app/src/components/layout/sidebar.tsx` + `bottom-nav.tsx` — **modify.** "Insights" nav entry.

All paths below are relative to the repo root; run `npm`/`git` commands from `app/` unless noted. Reference existing code: `app/src/server/services/fifoCosting.ts` (engine + `computeFifoAllocations`, `Draw`, `FifoAllocations`), `app/src/server/services/fifoCostingDb.ts` (loader pattern), `app/src/server/services/__tests__/fifoCosting.test.ts` (test style).

---

## Task 1: coaching.ts core — constants, types, `minRatePerKg`, `resolveFloor`, `computeBusinessAvgMargin`

**Files:**
- Create: `app/src/server/services/coaching.ts`
- Test: `app/src/server/services/__tests__/coaching.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `const FLOOR_BUFFER_PP = 1.0; const AGING_THRESHOLD_DAYS = 60; const TREND_DROP_PP = 2.0; const MIN_BUYER_SALES = 2;`
  - `interface CoachingSale { id: string; displayId: string; productId: string; buyerId: string; buyerName: string; date: string; revenue: number; cogs: number; totalKg: number; uncostedBags: number; }`
  - `function minRatePerKg(costPerKg: number, floorPct: number): number`
  - `function resolveFloor(o: { productOverride?: number | null; globalOverride?: number | null; businessAvgPct: number }): number`
  - `function computeBusinessAvgMargin(sales: CoachingSale[]): number`
  - Helper used by later tasks: `function marginPctOf(s: CoachingSale): number` (revenue>0 ? (revenue-cogs)/revenue*100 : 0)

Notes on semantics:
- `marginPctOf` and the business average use **revenue excl GST** as the base (consistent with the sales page's margin display).
- `computeBusinessAvgMargin` is **volume-weighted** (Σmargin / Σrevenue × 100), and only counts **fully-costed** sales (`uncostedBags === 0 && revenue > 0`) so understated COGS can't inflate the floor. Returns `0` when no qualifying revenue.
- `resolveFloor` returns `productOverride ?? globalOverride ?? (businessAvgPct + FLOOR_BUFFER_PP)`. `null`/`undefined` overrides fall through; `0` is a valid explicit override (do **not** treat 0 as missing — use `??`, not `||`).
- `minRatePerKg`: `costPerKg / (1 - floorPct/100)`. Caller guarantees `floorPct < 100`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/server/services/__tests__/coaching.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts`
Expected: FAIL — `Cannot find module '../coaching'` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `app/src/server/services/coaching.ts`:

```typescript
/**
 * Coaching insights — pure logic. No DB. Reuses the FIFO engine's outputs (per-sale
 * COGS, remaining lots) supplied by coachingDb.ts. All money in Rupees, percentages
 * as actual values (4 = 4%).
 */

// ── Tunable constants (single source of truth) ──────────────────────────────
export const FLOOR_BUFFER_PP = 1.0; // auto floor = business avg margin + this
export const AGING_THRESHOLD_DAYS = 60; // remaining stock older than this is "aging"
export const TREND_DROP_PP = 2.0; // margin drop (pp) that counts as "slipping"
export const MIN_BUYER_SALES = 2; // min sales before a buyer enters the scorecard

// ── Shared input shape ──────────────────────────────────────────────────────
export interface CoachingSale {
  id: string;
  displayId: string;
  productId: string;
  buyerId: string;
  buyerName: string;
  date: string; // YYYY-MM-DD
  revenue: number; // base amount, excl GST
  cogs: number; // FIFO cost of goods sold
  totalKg: number; // qtyBags * kgPerBag
  uncostedBags: number; // > 0 means COGS understated for this sale
}

export function marginPctOf(s: CoachingSale): number {
  return s.revenue > 0 ? ((s.revenue - s.cogs) / s.revenue) * 100 : 0;
}

export function minRatePerKg(costPerKg: number, floorPct: number): number {
  return costPerKg / (1 - floorPct / 100);
}

export function resolveFloor(o: {
  productOverride?: number | null;
  globalOverride?: number | null;
  businessAvgPct: number;
}): number {
  return o.productOverride ?? o.globalOverride ?? o.businessAvgPct + FLOOR_BUFFER_PP;
}

export function computeBusinessAvgMargin(sales: CoachingSale[]): number {
  let rev = 0;
  let margin = 0;
  for (const s of sales) {
    if (s.uncostedBags !== 0 || s.revenue <= 0) continue;
    rev += s.revenue;
    margin += s.revenue - s.cogs;
  }
  return rev > 0 ? (margin / rev) * 100 : 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
cd app && git add src/server/services/coaching.ts src/server/services/__tests__/coaching.test.ts
git commit -m "feat(coaching): core floor + business-avg margin primitives"
```

---

## Task 2: `findUnderpricedSales`

**Files:**
- Modify: `app/src/server/services/coaching.ts`
- Test: `app/src/server/services/__tests__/coaching.test.ts`

**Interfaces:**
- Consumes: `CoachingSale`, `marginPctOf`, `minRatePerKg` (Task 1).
- Produces:
  - `interface UnderpricedSale { saleId: string; displayId: string; productId: string; buyerId: string; buyerName: string; date: string; revenue: number; cogs: number; totalKg: number; marginPct: number; floorPct: number; minRatePerKg: number; moneyLeftOnTable: number; }`
  - `function findUnderpricedSales(sales: CoachingSale[], floorFor: (productId: string) => number): UnderpricedSale[]`

Semantics: consider only fully-costed sales (`uncostedBags === 0 && revenue > 0`). A sale is underpriced when `marginPctOf(sale) < floorFor(productId)`. `revenueAtFloor = cogs / (1 - floor/100)`, `moneyLeftOnTable = revenueAtFloor - revenue`, `minRatePerKg = minRatePerKg(cogs / totalKg, floor)`. A sale exactly at floor is **not** flagged (`moneyLeftOnTable` would be ~0). Result sorted by `moneyLeftOnTable` descending. (Uncosted sales are surfaced elsewhere via the existing sales-page "Uncosted" badge — intentionally excluded here so understated COGS can't fabricate "underpricing".)

- [ ] **Step 1: Write the failing tests**

Append to `coaching.test.ts`:

```typescript
import { findUnderpricedSales } from "../coaching";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts -t findUnderpricedSales`
Expected: FAIL — `findUnderpricedSales is not a function` / not exported.

- [ ] **Step 3: Implement**

Append to `coaching.ts`:

```typescript
export interface UnderpricedSale {
  saleId: string;
  displayId: string;
  productId: string;
  buyerId: string;
  buyerName: string;
  date: string;
  revenue: number;
  cogs: number;
  totalKg: number;
  marginPct: number;
  floorPct: number;
  minRatePerKg: number;
  moneyLeftOnTable: number;
}

export function findUnderpricedSales(
  sales: CoachingSale[],
  floorFor: (productId: string) => number
): UnderpricedSale[] {
  const out: UnderpricedSale[] = [];
  for (const s of sales) {
    if (s.uncostedBags !== 0 || s.revenue <= 0) continue;
    const floor = floorFor(s.productId);
    const marginPct = marginPctOf(s);
    if (marginPct >= floor) continue;
    const revenueAtFloor = s.cogs / (1 - floor / 100);
    const costPerKg = s.totalKg > 0 ? s.cogs / s.totalKg : 0;
    out.push({
      saleId: s.id,
      displayId: s.displayId,
      productId: s.productId,
      buyerId: s.buyerId,
      buyerName: s.buyerName,
      date: s.date,
      revenue: s.revenue,
      cogs: s.cogs,
      totalKg: s.totalKg,
      marginPct,
      floorPct: floor,
      minRatePerKg: minRatePerKg(costPerKg, floor),
      moneyLeftOnTable: revenueAtFloor - s.revenue,
    });
  }
  return out.sort((a, b) => b.moneyLeftOnTable - a.moneyLeftOnTable);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts`
Expected: PASS (all, including Task 1).

- [ ] **Step 5: Commit**

```bash
cd app && git add src/server/services/coaching.ts src/server/services/__tests__/coaching.test.ts
git commit -m "feat(coaching): findUnderpricedSales with money-left + min-rate"
```

---

## Task 3: `buyerScorecard`

**Files:**
- Modify: `app/src/server/services/coaching.ts`
- Test: `app/src/server/services/__tests__/coaching.test.ts`

**Interfaces:**
- Consumes: `CoachingSale`, `MIN_BUYER_SALES` (Task 1).
- Produces:
  - `interface BuyerScore { buyerId: string; buyerName: string; saleCount: number; totalRevenue: number; weightedMarginPct: number; gapPct: number; moneyAtStake: number; }`
  - `function buyerScorecard(sales: CoachingSale[], businessAvgPct: number): BuyerScore[]`

Semantics: group fully-costed sales (`uncostedBags === 0 && revenue > 0`) by `buyerId`. `weightedMarginPct = (Σrevenue − Σcogs) / Σrevenue × 100`. Include a buyer only if `saleCount >= MIN_BUYER_SALES` **and** `weightedMarginPct < businessAvgPct` (below your overall average — more sensitive than the floor, by design). `gapPct = businessAvgPct − weightedMarginPct`; `moneyAtStake = gapPct/100 × totalRevenue`. Sort by `moneyAtStake` descending.

- [ ] **Step 1: Write the failing tests**

Append to `coaching.test.ts`:

```typescript
import { buyerScorecard } from "../coaching";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts -t buyerScorecard`
Expected: FAIL — `buyerScorecard is not a function`.

- [ ] **Step 3: Implement**

Append to `coaching.ts`:

```typescript
export interface BuyerScore {
  buyerId: string;
  buyerName: string;
  saleCount: number;
  totalRevenue: number;
  weightedMarginPct: number;
  gapPct: number;
  moneyAtStake: number;
}

export function buyerScorecard(sales: CoachingSale[], businessAvgPct: number): BuyerScore[] {
  const agg = new Map<
    string,
    { name: string; count: number; revenue: number; margin: number }
  >();
  for (const s of sales) {
    if (s.uncostedBags !== 0 || s.revenue <= 0) continue;
    const a = agg.get(s.buyerId) ?? { name: s.buyerName, count: 0, revenue: 0, margin: 0 };
    a.count += 1;
    a.revenue += s.revenue;
    a.margin += s.revenue - s.cogs;
    a.name = s.buyerName;
    agg.set(s.buyerId, a);
  }
  const out: BuyerScore[] = [];
  for (const [buyerId, a] of agg) {
    if (a.count < MIN_BUYER_SALES) continue;
    const weightedMarginPct = a.revenue > 0 ? (a.margin / a.revenue) * 100 : 0;
    if (weightedMarginPct >= businessAvgPct) continue;
    const gapPct = businessAvgPct - weightedMarginPct;
    out.push({
      buyerId,
      buyerName: a.name,
      saleCount: a.count,
      totalRevenue: a.revenue,
      weightedMarginPct,
      gapPct,
      moneyAtStake: (gapPct / 100) * a.revenue,
    });
  }
  return out.sort((a, b) => b.moneyAtStake - a.moneyAtStake);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/server/services/coaching.ts src/server/services/__tests__/coaching.test.ts
git commit -m "feat(coaching): buyerScorecard ranked by money at stake"
```

---

## Task 4: `agingLots`

**Files:**
- Modify: `app/src/server/services/coaching.ts`
- Test: `app/src/server/services/__tests__/coaching.test.ts`

**Interfaces:**
- Consumes: `AGING_THRESHOLD_DAYS` (Task 1).
- Produces:
  - `interface RemainingLot { productId: string; productName: string; purchaseId: string; purchaseDisplayId: string; purchaseDate: string; remainingBags: number; costPerBag: number; }`
  - `interface AgingLot extends RemainingLot { ageDays: number; capitalTied: number; }`
  - `function agingLots(lots: RemainingLot[], today: string): AgingLot[]`

Semantics: `ageDays = floor((today − purchaseDate) / 1 day)` from `YYYY-MM-DD` strings (UTC midnight, so DST-safe). Include a lot only if `remainingBags > 0` and `ageDays >= AGING_THRESHOLD_DAYS`. `capitalTied = remainingBags × costPerBag`. Sort by `capitalTied × ageDays` descending.

- [ ] **Step 1: Write the failing tests**

Append to `coaching.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts -t agingLots`
Expected: FAIL — `agingLots is not a function`.

- [ ] **Step 3: Implement**

Append to `coaching.ts`:

```typescript
export interface RemainingLot {
  productId: string;
  productName: string;
  purchaseId: string;
  purchaseDisplayId: string;
  purchaseDate: string; // YYYY-MM-DD
  remainingBags: number;
  costPerBag: number;
}

export interface AgingLot extends RemainingLot {
  ageDays: number;
  capitalTied: number;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  return Math.floor((b - a) / MS_PER_DAY);
}

export function agingLots(lots: RemainingLot[], today: string): AgingLot[] {
  const out: AgingLot[] = [];
  for (const l of lots) {
    if (l.remainingBags <= 0) continue;
    const ageDays = daysBetween(l.purchaseDate, today);
    if (ageDays < AGING_THRESHOLD_DAYS) continue;
    out.push({ ...l, ageDays, capitalTied: l.remainingBags * l.costPerBag });
  }
  return out.sort((a, b) => b.capitalTied * b.ageDays - a.capitalTied * a.ageDays);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/server/services/coaching.ts src/server/services/__tests__/coaching.test.ts
git commit -m "feat(coaching): agingLots from FIFO remaining stock"
```

---

## Task 5: `marginTrend`

**Files:**
- Modify: `app/src/server/services/coaching.ts`
- Test: `app/src/server/services/__tests__/coaching.test.ts`

**Interfaces:**
- Consumes: `CoachingSale`, `TREND_DROP_PP` (Task 1).
- Produces:
  - `interface MonthMargin { month: string; marginPct: number; revenue: number; }`
  - `interface MarginTrendItem { productId: string; productName: string; baselineMarginPct: number; recentMarginPct: number; dropPp: number; recentRevenue: number; months: MonthMargin[]; }`
  - `function marginTrend(sales: CoachingSale[], productNames: Map<string, string>): MarginTrendItem[]`

Semantics: group fully-costed sales (`uncostedBags === 0 && revenue > 0`) by `productId`. Bucket by calendar month (`date.slice(0, 7)`, `YYYY-MM`). Need `>= 2` distinct months or skip the product. Sort months ascending; split into halves — `half = floor(n/2)`, `front = months[0..half-1]`, `back = months[n-half..n-1]` (drops the middle month when `n` is odd). `baselineMarginPct` = weighted margin across front-half **sales**; `recentMarginPct` = weighted across back-half sales; `recentRevenue` = back-half revenue. `dropPp = baselineMarginPct − recentMarginPct`; include only if `dropPp >= TREND_DROP_PP`. `months` carries every month's `{month, marginPct, revenue}` for display. Sort results by `dropPp × recentRevenue` descending.

- [ ] **Step 1: Write the failing tests**

Append to `coaching.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts -t marginTrend`
Expected: FAIL — `marginTrend is not a function`.

- [ ] **Step 3: Implement**

Append to `coaching.ts`:

```typescript
export interface MonthMargin {
  month: string; // YYYY-MM
  marginPct: number;
  revenue: number;
}

export interface MarginTrendItem {
  productId: string;
  productName: string;
  baselineMarginPct: number;
  recentMarginPct: number;
  dropPp: number;
  recentRevenue: number;
  months: MonthMargin[];
}

export function marginTrend(
  sales: CoachingSale[],
  productNames: Map<string, string>
): MarginTrendItem[] {
  // group by product -> month -> { revenue, margin }
  const byProduct = new Map<string, Map<string, { revenue: number; margin: number }>>();
  for (const s of sales) {
    if (s.uncostedBags !== 0 || s.revenue <= 0) continue;
    const month = s.date.slice(0, 7);
    const months = byProduct.get(s.productId) ?? new Map();
    const m = months.get(month) ?? { revenue: 0, margin: 0 };
    m.revenue += s.revenue;
    m.margin += s.revenue - s.cogs;
    months.set(month, m);
    byProduct.set(s.productId, months);
  }

  const out: MarginTrendItem[] = [];
  for (const [productId, monthMap] of byProduct) {
    const monthKeys = [...monthMap.keys()].sort();
    if (monthKeys.length < 2) continue;

    const months: MonthMargin[] = monthKeys.map((month) => {
      const m = monthMap.get(month)!;
      return { month, marginPct: m.revenue > 0 ? (m.margin / m.revenue) * 100 : 0, revenue: m.revenue };
    });

    const half = Math.floor(monthKeys.length / 2);
    const front = monthKeys.slice(0, half);
    const back = monthKeys.slice(monthKeys.length - half);

    const weighted = (keys: string[]) => {
      let rev = 0;
      let margin = 0;
      for (const k of keys) {
        const m = monthMap.get(k)!;
        rev += m.revenue;
        margin += m.margin;
      }
      return { pct: rev > 0 ? (margin / rev) * 100 : 0, rev };
    };

    const baseline = weighted(front);
    const recent = weighted(back);
    const dropPp = baseline.pct - recent.pct;
    if (dropPp < TREND_DROP_PP) continue;

    out.push({
      productId,
      productName: productNames.get(productId) ?? productId,
      baselineMarginPct: baseline.pct,
      recentMarginPct: recent.pct,
      dropPp,
      recentRevenue: recent.rev,
      months,
    });
  }
  return out.sort((a, b) => b.dropPp * b.recentRevenue - a.dropPp * a.recentRevenue);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd app && npx vitest run src/server/services/__tests__/coaching.test.ts`
Expected: PASS — the full coaching suite green.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/server/services/coaching.ts src/server/services/__tests__/coaching.test.ts
git commit -m "feat(coaching): marginTrend via weighted front/back half split"
```

---

## Task 6: Schema — add nullable margin-floor columns and push

**Files:**
- Modify: `app/src/server/db/schema.ts` (`config` table ~line 38; `products` table ~line 90)

**Interfaces:**
- Produces: `config.targetMarginFloorPct` and `products.marginFloorPct`, both `numeric(5,2)` nullable (NULL = "use the level below it / auto"). Consumed by Tasks 7, 8, 9.

This task changes the DB. Both columns are **nullable with no default**, so the `drizzle-kit push` is additive and safe on existing rows. `DATABASE_URL` points at production Supabase — adding nullable columns does not lock or rewrite the tables.

- [ ] **Step 1: Add the config column**

In `app/src/server/db/schema.ts`, inside the `config` table definition, after the `overdueDaysThreshold` line, add:

```typescript
  targetMarginFloorPct: numeric("target_margin_floor_pct", { precision: 5, scale: 2 }),
```

- [ ] **Step 2: Add the products column**

In the `products` table definition, after the `colorShade` line (before `active`), add:

```typescript
  marginFloorPct: numeric("margin_floor_pct", { precision: 5, scale: 2 }),
```

- [ ] **Step 3: Type-check the schema**

Run: `cd app && npx tsc --noEmit`
Expected: no new errors from `schema.ts`.

- [ ] **Step 4: Push the schema to the database**

Run: `cd app && npx drizzle-kit push`
Expected: drizzle reports two added columns (`config.target_margin_floor_pct`, `products.margin_floor_pct`) and applies them. Confirm no destructive/"data loss" prompts — if drizzle asks anything beyond adding these two nullable columns, **abort and report** rather than confirm.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/server/db/schema.ts
git commit -m "feat(coaching): nullable margin-floor columns on config and products"
```

---

## Task 7: `coachingDb.ts` loader + `insights` router + register

**Files:**
- Create: `app/src/server/services/coachingDb.ts`
- Create: `app/src/server/trpc/routers/insights.ts`
- Modify: the root router (find it: `cd app && grep -rl "router({" src/server/trpc/routers/_app.ts src/server/trpc/*.ts | head` — it imports each `*Router` and composes them; commonly `src/server/trpc/routers/_app.ts` or `src/server/trpc/root.ts`).

**Interfaces:**
- Consumes: `computeFifoAllocations` from `fifoCosting.ts`; from `coaching.ts` — `CoachingSale`, `RemainingLot`, `resolveFloor`, `computeBusinessAvgMargin`, `findUnderpricedSales`, `buyerScorecard`, `agingLots`, `marginTrend`, `FLOOR_BUFFER_PP`.
- Produces:
  - `async function loadCoachingData(db: any, tenantId: string, range: { from?: string; to?: string }): Promise<{ windowSales: CoachingSale[]; remainingLots: RemainingLot[]; businessAvgPct: number; autoFloorPct: number; globalOverride: number | null; floorByProduct: Map<string, number>; productNames: Map<string, string>; today: string; }>`
  - `insightsRouter` with `getAll` query (input `{ from?: string; to?: string }`).

Loader logic (one pass):
1. Load `config` row (for `targetMarginFloorPct`), all non-deleted `products` (id, displayId/name fields, `marginFloorPct`), all non-deleted `purchases` and `sales` (all-time — FIFO needs full history), and `contacts` for buyer names. Scope every query by `tenantId`.
2. Build `productNames: Map<productId, label>` where label is a human product name (compose from `millBrand` + `count` + `fibreType`, matching how products are labelled elsewhere — check `products.ts`/`products/page.tsx` for the existing label format and reuse it).
3. Run `computeFifoAllocations(allPurchaseRows, allSaleRows)` once. From `draws`, accumulate `cogsBySale: Map<saleId, number>` = Σ(`bags × costPerBag`) and `kgBySale`/use sale row for kg. From `uncostedBySale`, get uncosted bags per sale id.
4. Build `windowSales: CoachingSale[]` from sale rows whose `date` is within `[from, to]` (string compare on `YYYY-MM-DD`, same as dashboard). For each: `revenue = qtyBags × kgPerBag × ratePerKg` (use `D()`/`toMoney`), `cogs = cogsBySale.get(id) ?? 0`, `totalKg = qtyBags × kgPerBag`, `uncostedBags = uncostedBySale.get(id) ?? 0`, `buyerName` from contacts map.
5. `businessAvgPct = computeBusinessAvgMargin(windowSales)`; `autoFloorPct = businessAvgPct + FLOOR_BUFFER_PP`; `globalOverride = config?.targetMarginFloorPct != null ? Number(...) : null`.
6. `floorByProduct`: for each product, `resolveFloor({ productOverride: p.marginFloorPct != null ? Number(p.marginFloorPct) : null, globalOverride, businessAvgPct })`.
7. `remainingLots`: from `computeFifoAllocations(...).remainingByLot` (keyed by purchaseDisplayId). For each entry with `>0`, look up the purchase row (build a `Map<displayId, purchaseRow>`), compute `costPerBag = kgPerBag × ratePerKg`, fill `productName` from `productNames`. Note: `remainingByLot` includes zero entries — filter `>0` here or rely on `agingLots`' own `>0` guard (both fine; filter here to keep the array small).
8. `today = new Date().toISOString().slice(0, 10)`.

Router `getAll`:
```
const d = await loadCoachingData(ctx.db, ctx.tenantId, input ?? {});
const floorFor = (pid: string) => d.floorByProduct.get(pid) ?? d.autoFloorPct;
return {
  businessAvgPct: d.businessAvgPct,
  autoFloorPct: d.autoFloorPct,
  globalOverride: d.globalOverride,
  underpriced: findUnderpricedSales(d.windowSales, floorFor),
  buyers: buyerScorecard(d.windowSales, d.businessAvgPct),
  aging: agingLots(d.remainingLots, d.today),
  trends: marginTrend(d.windowSales, d.productNames),
};
```

- [ ] **Step 1: Read the references you need**

Read `app/src/server/services/fifoCostingDb.ts` (column-projection + loader pattern, `PURCHASE_COLS`/`SALE_COLS`/`ALLOC_*`), the `dateRangeInput` usage in `app/src/server/trpc/routers/dashboard.ts` (lines ~18-37), and how products are labelled in `app/src/server/trpc/routers/products.ts`. No code change in this step.

- [ ] **Step 2: Write the loader**

Create `app/src/server/services/coachingDb.ts`:

```typescript
/**
 * DB glue for coaching insights. Loads the tenant's full purchase/sale history once
 * (FIFO needs it), reuses computeFifoAllocations for per-sale COGS + remaining lots,
 * and shapes everything into the pure coaching.ts inputs. Compute-on-the-fly.
 */
import { and, eq, isNull } from "drizzle-orm";
import { config, products, purchases, sales, contacts } from "../db/schema";
import { computeFifoAllocations } from "./fifoCosting";
import { D, toMoney } from "./calculations";
import {
  resolveFloor,
  computeBusinessAvgMargin,
  FLOOR_BUFFER_PP,
  type CoachingSale,
  type RemainingLot,
} from "./coaching";

const ALLOC_PURCHASE_COLS = {
  id: purchases.id,
  productId: purchases.productId,
  date: purchases.date,
  qtyBags: purchases.qtyBags,
  kgPerBag: purchases.kgPerBag,
  ratePerKg: purchases.ratePerKg,
  createdAt: purchases.createdAt,
  displayId: purchases.displayId,
};
const ALLOC_SALE_COLS = {
  id: sales.id,
  productId: sales.productId,
  date: sales.date,
  qtyBags: sales.qtyBags,
  kgPerBag: sales.kgPerBag,
  ratePerKg: sales.ratePerKg,
  createdAt: sales.createdAt,
  displayId: sales.displayId,
  buyerId: sales.buyerId,
};

function productLabel(p: any): string {
  // Match how products are labelled elsewhere; adjust to the exact format used in products.ts.
  return [p.millBrand, p.count, p.fibreType].filter(Boolean).join(" ");
}

export async function loadCoachingData(
  db: any,
  tenantId: string,
  range: { from?: string; to?: string }
) {
  const [cfg, productRows, purchaseRows, saleRows, contactRows] = await Promise.all([
    db.select().from(config).where(eq(config.tenantId, tenantId)).then((r: any[]) => r[0]),
    db.select().from(products).where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt))),
    db.select(ALLOC_PURCHASE_COLS).from(purchases).where(and(eq(purchases.tenantId, tenantId), isNull(purchases.deletedAt))),
    db.select(ALLOC_SALE_COLS).from(sales).where(and(eq(sales.tenantId, tenantId), isNull(sales.deletedAt))),
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(eq(contacts.tenantId, tenantId)),
  ]);

  const productNames = new Map<string, string>();
  const productOverride = new Map<string, number | null>();
  for (const p of productRows) {
    productNames.set(p.id, productLabel(p));
    productOverride.set(p.id, p.marginFloorPct != null ? Number(p.marginFloorPct) : null);
  }
  const buyerName = new Map<string, string>();
  for (const c of contactRows) buyerName.set(c.id, c.name);

  const alloc = computeFifoAllocations(purchaseRows, saleRows);
  const cogsBySale = new Map<string, number>();
  for (const dw of alloc.draws) {
    cogsBySale.set(dw.saleId, (cogsBySale.get(dw.saleId) ?? 0) + dw.bags * dw.costPerBag);
  }

  const from = range.from ?? null;
  const to = range.to ?? null;
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to);

  const windowSales: CoachingSale[] = [];
  for (const s of saleRows) {
    const dateIso = String(s.date).slice(0, 10);
    if (!inRange(dateIso)) continue;
    const totalKg = toMoney(D(s.qtyBags).mul(D(s.kgPerBag)));
    const revenue = toMoney(D(s.qtyBags).mul(D(s.kgPerBag)).mul(D(s.ratePerKg)));
    windowSales.push({
      id: s.id,
      displayId: s.displayId,
      productId: s.productId,
      buyerId: s.buyerId,
      buyerName: buyerName.get(s.buyerId) ?? "Unknown",
      date: dateIso,
      revenue,
      cogs: toMoney(D(cogsBySale.get(s.id) ?? 0)),
      totalKg,
      uncostedBags: alloc.uncostedBySale.get(s.id) ?? 0,
    });
  }

  const businessAvgPct = computeBusinessAvgMargin(windowSales);
  const autoFloorPct = businessAvgPct + FLOOR_BUFFER_PP;
  const globalOverride = cfg?.targetMarginFloorPct != null ? Number(cfg.targetMarginFloorPct) : null;

  const floorByProduct = new Map<string, number>();
  for (const p of productRows) {
    floorByProduct.set(
      p.id,
      resolveFloor({ productOverride: productOverride.get(p.id) ?? null, globalOverride, businessAvgPct })
    );
  }

  const purchaseByDisplayId = new Map<string, any>();
  for (const p of purchaseRows) purchaseByDisplayId.set(p.displayId, p);

  const remainingLots: RemainingLot[] = [];
  for (const [displayId, bags] of alloc.remainingByLot) {
    if (bags <= 0) continue;
    const p = purchaseByDisplayId.get(displayId);
    if (!p) continue;
    remainingLots.push({
      productId: p.productId,
      productName: productNames.get(p.productId) ?? p.productId,
      purchaseId: p.id,
      purchaseDisplayId: displayId,
      purchaseDate: String(p.date).slice(0, 10),
      remainingBags: bags,
      costPerBag: toMoney(D(p.kgPerBag).mul(D(p.ratePerKg))),
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return { windowSales, remainingLots, businessAvgPct, autoFloorPct, globalOverride, floorByProduct, productNames, today };
}
```

Note: verify `D`/`toMoney` are exported from `calculations.ts` (they are used across services). If `productLabel` doesn't match the app's product naming, align it with `products.ts`.

- [ ] **Step 3: Write the router**

Create `app/src/server/trpc/routers/insights.ts`:

```typescript
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { loadCoachingData } from "../../services/coachingDb";
import {
  findUnderpricedSales,
  buyerScorecard,
  agingLots,
  marginTrend,
} from "../../services/coaching";

const rangeInput = z.object({ from: z.string().optional(), to: z.string().optional() }).optional();

export const insightsRouter = router({
  getAll: protectedProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    const d = await loadCoachingData(ctx.db, ctx.tenantId, input ?? {});
    const floorFor = (pid: string) => d.floorByProduct.get(pid) ?? d.autoFloorPct;
    return {
      businessAvgPct: d.businessAvgPct,
      autoFloorPct: d.autoFloorPct,
      globalOverride: d.globalOverride,
      underpriced: findUnderpricedSales(d.windowSales, floorFor),
      buyers: buyerScorecard(d.windowSales, d.businessAvgPct),
      aging: agingLots(d.remainingLots, d.today),
      trends: marginTrend(d.windowSales, d.productNames),
    };
  }),
});
```

Confirm the import paths for `router`/`protectedProcedure` match the other routers (open `config.ts` — it imports from `../trpc`; mirror exactly).

- [ ] **Step 4: Register the router**

Open the root router file (from the grep in Files). Add the import and entry, mirroring existing ones, e.g.:

```typescript
import { insightsRouter } from "./insights";
// ...inside router({ ... }):
  insights: insightsRouter,
```

- [ ] **Step 5: Type-check**

Run: `cd app && npx tsc --noEmit`
Expected: no new errors. (Pre-existing `any`-related lint is acceptable per repo convention; there must be no type errors.)

- [ ] **Step 6: Smoke-test against real data (read-only)**

Create a temporary script `app/scripts/smoke-insights.ts`:

```typescript
import "dotenv/config";
import { db } from "../src/server/db"; // adjust to the actual db export path
import { sql } from "drizzle-orm";
import { loadCoachingData } from "../src/server/services/coachingDb";
import { findUnderpricedSales, buyerScorecard, agingLots, marginTrend } from "../src/server/services/coaching";

async function main() {
  // Use the real tenant id that owns the production data.
  const tenantId = process.argv[2];
  if (!tenantId) throw new Error("pass tenantId as arg");
  const d = await loadCoachingData(db, tenantId, {});
  const floorFor = (pid: string) => d.floorByProduct.get(pid) ?? d.autoFloorPct;
  console.log({
    businessAvgPct: d.businessAvgPct.toFixed(2),
    autoFloorPct: d.autoFloorPct.toFixed(2),
    windowSales: d.windowSales.length,
    remainingLots: d.remainingLots.length,
    underpriced: findUnderpricedSales(d.windowSales, floorFor).slice(0, 3),
    buyers: buyerScorecard(d.windowSales, d.businessAvgPct).slice(0, 3),
    aging: agingLots(d.remainingLots, d.today).slice(0, 3),
    trends: marginTrend(d.windowSales, d.productNames).slice(0, 3),
  });
  process.exit(0);
}
main();
```

Find the right tenant id (the one owning real products): `cd app && npx tsx -e "import {db} from './src/server/db'; import {products} from './src/server/db/schema'; db.select().from(products).limit(5).then((r)=>{console.log(r.map((p)=>({t:p.tenantId,b:p.millBrand})));process.exit(0)})"` — pick the tenant of the real yarn brands.

Run: `cd app && npx tsx scripts/smoke-insights.ts <tenantId>`
Expected: sane numbers — businessAvgPct near the known ~3%, non-empty windowSales, a few ranked items per section without throwing. Sanity-check one underpriced row's `moneyLeftOnTable` and `minRatePerKg` by hand.

- [ ] **Step 7: Delete the smoke script and commit**

```bash
cd app && rm scripts/smoke-insights.ts
git add src/server/services/coachingDb.ts src/server/trpc/routers/insights.ts <root-router-file>
git commit -m "feat(coaching): DB loader + insights router (getAll)"
```

(Replace `<root-router-file>` with the actual path you modified.)

---

## Task 8: Global margin-floor in Settings

**Files:**
- Modify: `app/src/server/trpc/routers/config.ts` (`update` input + values)
- Modify: `app/src/app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Consumes: `config.targetMarginFloorPct` column (Task 6); `insights.getAll` returns `autoFloorPct` for display (Task 7).
- Produces: persisted global floor; Settings UI field.

- [ ] **Step 1: Extend the config router input**

In `app/src/server/trpc/routers/config.ts`, in the `update` mutation's `z.object`, add:

```typescript
        targetMarginFloorPct: z.string().nullable().optional(),
```

And in the `values` object built before insert/update, add (keep it a string or null for `numeric`):

```typescript
        targetMarginFloorPct:
          input.targetMarginFloorPct === undefined ? undefined : input.targetMarginFloorPct,
```

(Drizzle maps `numeric` columns to string | null. Passing `undefined` leaves it unchanged on update; passing `null` clears it back to auto.)

- [ ] **Step 2: Add the Settings field**

In `app/src/app/(dashboard)/settings/page.tsx`, find where existing config fields (e.g. `defaultGstRate`, `overdueDaysThreshold`) are rendered and submitted. Add a controlled input for the margin floor that:
- Shows the current `config.targetMarginFloorPct` (empty when null).
- Has helper copy: `"Leave blank to auto-set from your average margin. Underpriced-sale and buyer-squeeze alerts use this floor."`
- On save, includes `targetMarginFloorPct: value.trim() === "" ? null : value.trim()` in the `update` mutation payload.

Match the existing field markup/labels-above pattern (per DESIGN_UX_GUIDE: label above, `%` suffix inline, optional marked). Reuse the page's existing form state and submit handler — do not introduce a second form.

- [ ] **Step 3: Type-check and manual verify**

Run: `cd app && npx tsc --noEmit` → no new errors.
Run: `cd app && npm run dev`, open Settings, set the floor to `4`, save, reload — value persists. Clear it, save, reload — blank persists (auto). Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd app && git add src/server/trpc/routers/config.ts "src/app/(dashboard)/settings/page.tsx"
git commit -m "feat(coaching): global margin-floor setting"
```

---

## Task 9: Per-product margin-floor override

**Files:**
- Modify: `app/src/server/trpc/routers/products.ts` (accept/persist `marginFloorPct`; return it + a per-product `autoFloorPct` in detail)
- Modify: `app/src/app/(dashboard)/products/page.tsx` (override field)

**Interfaces:**
- Consumes: `products.marginFloorPct` column (Task 6).
- Produces: persisted per-product override; product detail surfaces current override + the resolved auto default so an edit is informed.

- [ ] **Step 1: Persist the override in the products router**

In `app/src/server/trpc/routers/products.ts`, find the create/update mutation input schema and add:

```typescript
        marginFloorPct: z.string().nullable().optional(),
```

In the values written to the `products` row, pass it through unchanged (string | null; `undefined` = leave as-is on update). In `getDetail`, include `marginFloorPct: product.marginFloorPct` in the returned object so the UI can show the current value. (The auto default for display is already available from `insights.getAll().autoFloorPct`; the product page can read that, or you can compute a business-avg-based hint server-side — simplest is to show the global/auto value via the insights query. Reuse `insights.getAll` rather than duplicating the floor math.)

- [ ] **Step 2: Add the override field to the product UI**

In `app/src/app/(dashboard)/products/page.tsx`, in the product edit form (where `millBrand`, `count`, etc. are edited), add an optional "Minimum margin %" input:
- Label above, `%` suffix, marked "(optional)".
- Helper: `"Blank = use your global/auto floor (currently X%). Set a number to hold this yarn to its own minimum."` where `X` comes from `trpc.insights.getAll.useQuery({}).data?.autoFloorPct` (or `globalOverride ?? autoFloorPct`).
- On save include `marginFloorPct: value.trim() === "" ? null : value.trim()`.

Match the existing product-form markup and submit handler.

- [ ] **Step 3: Type-check and manual verify**

Run: `cd app && npx tsc --noEmit` → no new errors.
Run dev, edit a product, set floor `6`, save, reload — persists; the `/insights` underpriced section now judges that product at 6%. Clear it — falls back to global/auto. Stop dev server.

- [ ] **Step 4: Commit**

```bash
cd app && git add src/server/trpc/routers/products.ts "src/app/(dashboard)/products/page.tsx"
git commit -m "feat(coaching): per-product margin-floor override"
```

---

## Task 10: `/insights` review hub + nav

**Files:**
- Create: `app/src/app/(dashboard)/insights/page.tsx`
- Modify: `app/src/components/layout/sidebar.tsx`
- Modify: `app/src/components/layout/bottom-nav.tsx`

**Interfaces:**
- Consumes: `trpc.insights.getAll.useQuery({ from, to })` (Task 7) returning `{ businessAvgPct, autoFloorPct, globalOverride, underpriced[], buyers[], aging[], trends[] }`.
- Produces: the review page + nav entries.

- [ ] **Step 1: Build the page**

Create `app/src/app/(dashboard)/insights/page.tsx` as a client component that:
- Uses `useDateRange()` + `DateRangePicker`/`ActiveRangeBanner` exactly like `sales/page.tsx` and passes `toServerInput(range)` (or the same `{from,to}` shape those pages send) into `trpc.insights.getAll.useQuery(...)`.
- Renders a short header line: `"Healthy margin floor: {globalOverride ?? autoFloorPct}% {globalOverride == null ? '(auto from your ' + businessAvgPct.toFixed(1) + '% average)' : '(your setting)'} — change in Settings."`
- Renders four collapsible sections (reuse the collapsible-card pattern from `products/page.tsx`'s `LotLedger`), each defaulting to expanded when it has items, with an honest empty state when it doesn't:
  1. **Underpriced sales** — rows: `displayId`, buyer, date, `marginPct` (red) vs `floorPct`, `"₹{moneyLeftOnTable} left on table"` as the hero number, `"should've charged ≥ ₹{minRatePerKg}/kg"`. Each row links to `/sales` (filtered/anchored to that sale if the page supports it; otherwise plain link to `/sales`). Empty: `"Nothing underpriced this period — nicely done."`
  2. **Buyer squeeze** — rows: `buyerName`, `"you earn {weightedMarginPct}% vs {businessAvgPct}% overall"`, `"₹{moneyAtStake} at stake"` hero, `saleCount`. Link to the contact (`/contacts` or contact detail). Empty: `"No buyer is dragging your margin down right now."`
  3. **Aging stock** — rows: `productName`, `purchaseDisplayId`, `"{remainingBags} bags, {ageDays} days old"`, `"₹{capitalTied} tied up"` hero. Link to `/products`. Empty: `"No stock sitting too long."`
  4. **Margin trend** — rows: `productName`, `"{baselineMarginPct}% → {recentMarginPct}% ({dropPp}pp drop)"`, optional inline month list from `months`. Link to `/products`. Empty: `"Margins are holding steady."`
- Use `formatIndianCurrency` from `@/lib/utils` for all money; show one decimal for percentages.
- Loading state: reuse a skeleton like other pages.

Keep it a presentational page — all logic already lives server-side. Follow DESIGN_UX_GUIDE (32px hero numbers, 12px radius cards, collapsible on mobile, conversational copy).

- [ ] **Step 2: Add nav entries**

In `app/src/components/layout/sidebar.tsx`, import a suitable icon from `lucide-react` (e.g. `Lightbulb`) and add to the nav array, after `Trends`:

```typescript
  { label: "Insights", href: "/insights", icon: Lightbulb },
```

In `app/src/components/layout/bottom-nav.tsx`, add the same entry to its overflow/nav list (it already has many secondary items — place `Insights` near `Trends`):

```typescript
  { label: "Insights", href: "/insights", icon: Lightbulb },
```

Make sure `Lightbulb` (or your chosen icon) is added to the existing `lucide-react` import in each file.

- [ ] **Step 3: Type-check, build, manual verify**

Run: `cd app && npx tsc --noEmit` → no new errors.
Run: `cd app && npm run build` → compiles successfully.
Run dev, open `/insights`: the four sections render with the seeded/real data; change the date range and the lists update; empty states show when a section has nothing; nav entry highlights when active on desktop and mobile widths.

- [ ] **Step 4: Commit**

```bash
cd app && git add "src/app/(dashboard)/insights/page.tsx" src/components/layout/sidebar.tsx src/components/layout/bottom-nav.tsx
git commit -m "feat(coaching): /insights review hub + nav entry"
```

---

## Task 11: Full verification + ship

**Files:** none (verification + deploy).

- [ ] **Step 1: Full test suite**

Run: `cd app && npm test`
Expected: all coaching tests pass; the only failure is the pre-existing `computePurchaseBalance > returns Paid when overpaid`. No new failures.

- [ ] **Step 2: Full type-check + build**

Run: `cd app && npx tsc --noEmit && npm run build`
Expected: clean type-check; successful build.

- [ ] **Step 3: Push to GitHub**

```bash
cd /Users/siddhant/claude/SYTERP && git push origin main
```

- [ ] **Step 4: Deploy to Vercel production**

The Vercel project Root Directory is `app`, so deploy from the repo root with the `.vercel` link copied there (the established procedure for this repo):

```bash
cd /Users/siddhant/claude/SYTERP && cp -r app/.vercel ./.vercel && vercel --prod --yes; rm -rf ./.vercel
```

Expected: `readyState: READY`. Report the production URL. Verify `/insights` loads on the deployed site.

---

## Self-Review (completed during planning)

**Spec coverage:**
- Margin floor chain (auto/global/product, recommend-then-edit) → Task 1 (`resolveFloor`), Task 6 (columns), Task 8 (global), Task 9 (per-product). ✅
- Auto = business avg + buffer, always displayed → Task 1, surfaced in Tasks 8/9/10. ✅
- Min-rate formula → Task 1 (`minRatePerKg`), used in Task 2. ✅
- Underpriced sales (money left, min rate, uncosted excluded, exactly-at-floor not flagged) → Task 2. ✅
- Buyer scorecard (weighted, below-average flag, min-volume, money at stake) → Task 3. ✅
- Aging stock (from `remainingByLot`, threshold, capital tied, `today` param) → Task 4. ✅
- Margin trend (front/back half split, ≥2 months, drop threshold) → Task 5. ✅
- `/insights` hub, money-ranked, deep links, empty states, date range, nav → Task 10. ✅
- Architecture: pure service + thin loader + router + compute-on-the-fly → Tasks 1–7. ✅
- Constants named in one place → Task 1. ✅
- Tests TDD on pure functions → Tasks 1–5. ✅

**Placeholder scan:** No "TBD"/"handle edge cases"/"write tests for the above" — every code step has full code; two spots ask the implementer to match an existing UI/label pattern (product label format; Settings/product form markup) and tell them exactly where to look. ✅

**Type consistency:** `CoachingSale`, `RemainingLot`, `UnderpricedSale`, `BuyerScore`, `AgingLot`, `MarginTrendItem`, `MonthMargin` defined once in Task 1–5 and consumed with the same field names by `coachingDb.ts`/`insights.ts` (Task 7) and the page (Task 10). `findUnderpricedSales(sales, floorFor)`, `buyerScorecard(sales, businessAvgPct)`, `agingLots(lots, today)`, `marginTrend(sales, productNames)` signatures match between definition and call sites. ✅
