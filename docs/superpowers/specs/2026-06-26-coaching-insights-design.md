# Coaching Insights Layer — Design

**Date:** 2026-06-26
**Status:** Approved (design), pending spec review
**Author:** brainstormed with Siddhant

## Problem

The ERP today is largely a data-entry product: you record purchases/sales/payments
and see four dashboard metrics plus FIFO traceability. It does not yet *help the user
make better decisions*. The end user (Siddhant's brother) sells on instinct and dislikes
manual entry. He reviews the business **periodically** (weekly/monthly), not live during
a negotiation. He needs the system to **coach him after the fact** — surface where he
left money on the table and what to watch.

## Goal

Add a decision-support "coaching" layer that, on a periodic review, surfaces four
insights ranked by money at stake, each deep-linking to the place to act:

1. **Underpriced sales** — sales whose realized margin fell below a healthy floor.
2. **Buyer squeeze scorecard** — buyers from whom he earns below-average margin.
3. **Aging / stuck stock** — FIFO lots sitting unsold and tying up capital.
4. **Margin trend slipping** — products whose realized margin is declining over time.

Non-goals (explicitly out of scope for this spec):
- Live, mid-negotiation pricing co-pilot (he prices on instinct elsewhere).
- Auto-changing any sale price. Coaching only — it never edits transactions.
- Forecasting / demand prediction.

## Core concept: the margin floor

"Underpriced" is defined by a **margin floor %** resolved down a chain, recommend-then-edit:

```
effectiveFloor(product) = product.marginFloorPct        // per-product override, nullable
                       ?? settings.targetMarginFloorPct  // global override, nullable
                       ?? autoDefault()                  // computed
autoDefault() = businessAvgRealizedMarginPct + FLOOR_BUFFER_PP   // FLOOR_BUFFER_PP = 1.0
```

- `businessAvgRealizedMarginPct` = total realized gross margin ÷ total revenue across the
  selected window (volume-weighted, not a simple average of percentages).
- The user changes nothing to get value. The auto default is **always displayed** next to
  any editable floor field, so an override is informed, not blind.
- All three levels are editable: global in Settings, per-product on the product.

### Minimum-rate formula

From a floor % and a FIFO cost-per-kg, the minimum sell rate is:

```
min_rate_per_kg = fifo_cost_per_kg / (1 - floor/100)
```

This single formula powers two surfaces:
- **Past sale**: "you should have charged ≥ ₹X/kg" using that sale's actual FIFO COGS.
- **Product going forward**: "sell above ₹X/kg" using the cost of the **oldest remaining
  lot** (the next bags FIFO will draw).

Edge: if `floor >= 100`, treat as invalid and clamp/skip (defensive; never expected).

## The four insights

All computations reuse the existing FIFO engine (`computeFifoAllocations`,
`computeSaleCosting`, `computeFifoInventoryValue`) and run **compute-on-the-fly** —
no new materialized tables.

### 1. Underpriced sales

For each non-deleted sale in the window:
- `realizedMarginPct = grossMargin / revenue * 100` (revenue = base amount, excl GST,
  consistent with existing sale margin display).
- Flag if `realizedMarginPct < effectiveFloor(product)`.
- `revenueAtFloor = cogs / (1 - floor/100)`.
- `moneyLeftOnTable = revenueAtFloor - actualRevenue` (≥ 0 for flagged sales).
- `minRatePerKg = cogs / totalKg / (1 - floor/100)`.

Output: list ranked by `moneyLeftOnTable` desc. Each row → links to the sale.
A sale exactly at floor reports `moneyLeftOnTable = 0` and is **not** flagged.
Uncosted sales (sold beyond purchased stock) are shown but tagged "cost incomplete —
margin overstated" and excluded from ranking, because their COGS is understated.

### 2. Buyer squeeze scorecard

Per buyer over the window:
- `totalRevenue`, `totalCogs`, `weightedMarginPct = (totalRevenue - totalCogs)/totalRevenue*100`.
- Compare to `businessAvgRealizedMarginPct`.
- `gapPct = businessAvg - weightedMarginPct` (positive = below average).
- Flag if `weightedMarginPct < businessAvgRealizedMarginPct` (below your overall average —
  a buyer can be your worst without breaching the floor; this is intentionally more
  sensitive than the floor).
- `moneyAtStake = (gapPct/100) * totalRevenue` — what closing the gap to average is worth.

Output: ranked by `moneyAtStake` desc. Each row → links to the contact.
Buyers below a minimum volume (default: < 2 sales OR negligible revenue) are excluded to
avoid noise from one-off transactions.

### 3. Aging / stuck stock

From `computeFifoAllocations(...).remainingByLot` per product (already implemented):
- For each lot with `remainingBags > 0`: `ageDays = today - purchaseDate`.
- Flag if `ageDays >= AGING_THRESHOLD_DAYS` (default 60).
- `capitalTied = remainingBags * costPerBag`.
- `score = capitalTied * ageDays` for ranking.

Output: ranked by `score` desc. Each row → links to the product (and identifies the lot
/ purchase). `today` is passed in as a parameter (pure function stays deterministic).

### 4. Margin trend slipping

Per product, bucket the window's sales by **calendar month**:
- For each month: `monthMarginPct = monthMargin / monthRevenue * 100`.
- Need ≥ 2 months with sales to assess a trend.
- Split the product's ordered months into two halves (front = older, back = recent; with an
  odd count, the middle month is dropped). `baselineMarginPct` = weighted margin of the front
  half; `recentMarginPct` = weighted margin of the back half. Using weighted halves (not
  single months) is what makes this "sustained" rather than a one-month blip.
- `dropPp = baselineMarginPct - recentMarginPct`. Flag if `dropPp >= TREND_DROP_PP` (default 2.0).
- `score = dropPp * recentRevenue` for ranking (recentRevenue = back-half revenue).

Output: ranked by `score` desc. Each row → links to product detail, shows the per-month
margin series so he can see the slide.

## Tunable constants (chosen defaults, all sign-off)

| Constant | Default | Meaning |
|---|---|---|
| `FLOOR_BUFFER_PP` | 1.0 | Buffer above business avg for the auto floor |
| `AGING_THRESHOLD_DAYS` | 60 | When remaining stock counts as "aging" |
| `TREND_DROP_PP` | 2.0 | Margin drop (pp) that counts as "slipping" |
| `MIN_BUYER_SALES` | 2 | Min sales before a buyer appears in the scorecard |

These live as named constants in `coaching.ts` (single source of truth), not magic numbers.
The margin floor itself is user-editable (global + per-product); the other three are
code constants for v1 (can be promoted to settings later if needed — YAGNI for now).

## Surface: the `/insights` review hub

A single page the user opens for his periodic review.

- Reuses the existing `DateRangePicker` / `useDateRange` (default: a sensible recent window,
  e.g. last 30 days, matching other pages' behavior).
- Four sections, each a ranked list, **money at stake shown prominently** (32px-style hero
  per UX guide where appropriate), collapsible cards (mobile-friendly per DESIGN_UX_GUIDE).
- Each row deep-links to the actual sale / contact / product to act on. No duplicated
  detail UI — the hub points *into* existing pages.
- Honest, conversational empty states ("Nothing underpriced this month — nicely done.").
- A small header line summarizing the effective auto floor and where to change it.
- New nav entry in `sidebar.tsx` and `bottom-nav.tsx` ("Insights").

This satisfies the user's standing principle ("relevant info at relevant touchpoints, not
two interfaces"): the hub is the *review* surface; the *act* surfaces remain the existing
pages it links to. We are not duplicating sale/product detail.

## Architecture

Follows the existing pure-service + thin-DB-loader + tRPC pattern.

- **`src/server/services/coaching.ts`** (pure, no DB, fully unit-tested):
  - `resolveFloor({ productOverride, globalOverride, businessAvgPct })`
  - `computeBusinessAvgMargin(sales)` → weighted realized margin %
  - `findUnderpricedSales(sales, floorResolver)` → ranked underpriced list
  - `buyerScorecard(sales, businessAvgPct)` → ranked buyers
  - `agingLots(remainingByLotPerProduct, today)` → ranked aging lots
  - `marginTrend(salesByProduct)` → ranked slipping products
  - `minRatePerKg(costPerKg, floorPct)` helper
  - exported constants `FLOOR_BUFFER_PP`, `AGING_THRESHOLD_DAYS`, `TREND_DROP_PP`,
    `MIN_BUYER_SALES`
  - Input types are plain shapes (saleId, productId, buyerId, displayIds, revenue, cogs,
    margin, date, kg) — decoupled from Drizzle rows.

- **`src/server/services/coachingDb.ts`** (thin glue):
  - Loads the tenant's non-deleted products, purchases, sales once.
  - Reuses `computeFifoAllocations` per product for COGS-per-sale and `remainingByLot`.
  - Maps DB rows → pure-function input shapes; calls the pure functions.
  - `loadCoachingData(db, tenantId, range)` returns everything the router needs.

- **`src/server/trpc/routers/insights.ts`**:
  - `protectedProcedure` queries scoped by `ctx.tenantId`.
  - Either one `getAll({ range })` or four section queries (lean to `getAll` so the hub
    loads in one round trip; sections are cheap once data is loaded once).

- **Settings / overrides**:
  - Global `targetMarginFloorPct` (nullable) — add to the config/settings table + Settings UI.
  - Per-product `marginFloorPct` (nullable) — add column to `products` + edit field on the
    product page; show the resolved auto default beside it.

- **UI**: `src/app/(dashboard)/insights/page.tsx` + nav entries.

### Data-volume note

Single tenant, Phase 1 scale. Loading all purchases/sales once per review is acceptable.
`loadCoachingData` does **one** pass: load rows, group by product, run FIFO per product
once, derive all four insights from the same in-memory structures. If scale ever demands
it, this is the natural place to add caching — out of scope now.

## Error handling

- Empty data / no sales in window → each section returns an empty list; UI shows empty state.
- Division-by-zero guards: revenue 0 → skip the sale from margin math (can't compute %).
- `floor >= 100` → invalid, skipped defensively.
- Uncosted sales → surfaced but excluded from underpriced ranking (COGS understated).
- Deleted rows excluded at the loader (consistent with existing endpoints).

## Testing (TDD)

Pure functions in `coaching.ts` get unit tests first (RED → GREEN):
- `resolveFloor`: product override wins; falls back to global; falls back to auto.
- `computeBusinessAvgMargin`: weighted (not mean-of-percents); handles zero revenue.
- `minRatePerKg`: known cost+floor → known rate; floor 0 → cost; reconciliation that a sale
  priced exactly at `minRatePerKg` lands exactly at the floor margin.
- `findUnderpricedSales`: flags below floor; sale exactly at floor → not flagged, 0 left on
  table; ranking by money; uncosted excluded from ranking.
- `buyerScorecard`: weighted margin per buyer; below-average flagged; money-at-stake;
  min-volume filter.
- `agingLots`: age from `today`; threshold boundary; capital-tied math; ranking.
- `marginTrend`: sustained drop flagged; single-month blip not flagged; needs ≥ 2 months;
  ranking by drop × volume.

Then DB-loader and router wired with the existing patterns; manual smoke against real data
(read-only) as done for prior features.

## Out of scope / future

- Promoting aging/trend thresholds to user settings.
- Notifications / digests pushed to him (this is pull-only for now).
- Per-buyer target margins.
