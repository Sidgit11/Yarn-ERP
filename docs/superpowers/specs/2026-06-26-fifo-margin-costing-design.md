# FIFO Margin Costing — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

Gross margin is currently computed using a **global all-time weighted-average cost per
product**: `Σ(kg × rate) / Σ(kg)`. That single average cost is applied everywhere COGS
appears — per-sale margin (`sales.ts`), the dashboard, and the trends buckets
(`trends.ts`).

At a **product level over all time** this averaging is acceptable. But at a
**transaction level**, or aggregated over a **month / arbitrary time range**, the average
"smears" cost across the whole product history. A sale that actually drew from cheap early
stock is charged the same per-kg cost as a sale that drew from later, pricier stock. This
distorts transaction-level and period-level margins.

## Goal

Cost each sale against purchases on a **FIFO** basis: a sale consumes the oldest available
purchased stock first, and its COGS reflects the cost of the specific stock it drew from.

Worked example (the canonical case): 100 bags of a product purchased as 50 @ price p1 then
50 @ price p2. Sales booked as 30, 20, 50 bags. FIFO costs the first 30 and 20 bags at p1,
and the next 50 bags at p2.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| FIFO unit | **Bags** | User thinks and trades in bags. Accuracy preserved by deriving cost-per-bag per layer. |
| Cost-per-bag | Derived **per purchase layer** as `kgPerBag × ratePerKg` | Handles varying `kgPerBag` across purchases so each layer carries its own correct cost despite per-kg pricing. |
| Oversell (cumulative sales > cumulative purchases) | **Flag as uncosted** | Excess bags contribute 0 COGS and surface a warning, making bad/incomplete data a visible signal rather than a hidden distortion. |
| Scope | Per-sale margin, Trends buckets, Dashboard period margin, Product-level rollups | FIFO becomes the single costing basis everywhere, so all numbers reconcile. |
| Compute model | **Compute on the fly** (no new tables) | Always correct under edits/deletes/back-dated entries; simple; fine at current data scale. |

## Architecture

### Core costing service (new)

**File:** `app/src/server/services/fifoCosting.ts`

One pure function is the heart of the feature:

```
computeSaleCosting(purchases, sales) → Map<saleId, SaleCosting>

SaleCosting = { cogs: number, costedBags: number, uncostedBags: number }
```

Inputs are minimal rows: `{ id, productId, date, qtyBags, kgPerBag, ratePerKg }` plus a
stable ordering key (creation order / `displayId` / `createdAt`).

**Algorithm, per product:**

1. Build cost **layers** from the product's purchases, sorted by `date` ascending
   (tiebreak: creation order). Each layer:
   `{ remainingBags: qtyBags, costPerBag: kgPerBag × ratePerKg }`.
2. Sort the product's sales by `date` ascending (same tiebreak).
3. Walk sales oldest → newest. Each sale consumes `qtyBags` from the front of the layer
   queue, splitting a partially-consumed layer. `cogs += takenBags × layer.costPerBag`.
4. If the queue empties while a sale still needs bags, the remainder is **uncosted**
   (`uncostedBags`, contributing 0 to COGS). This occurs only when cumulative sales exceed
   cumulative purchases for that product.

Properties:
- **Pure** — no DB access, no new tables. Deterministic given its inputs.
- Recomputed per request from the **full transaction history** of the products in scope.
- Correct after edits, deletes, and back-dated entries because nothing is materialized.

Money rounding follows existing conventions in `calculations.ts` (`toMoney` / `Decimal`).

### Consumption per surface

Every margin view is an aggregation of one underlying computation — *each sale's FIFO COGS*.

- **Per-sale** (`sales.ts`): replace avg-cost COGS with the sale's `cogs` from the map.
  `grossMargin = base − cogs − transport − brokerCommission` (otherwise unchanged).
  `grossMarginPct = grossMargin / base × 100`. Response gains `uncostedBags` and an
  `uncosted: boolean` flag.
- **Trends** (`trends.ts`): remove the global avg-cost line. Bucket each sale's
  `(base − cogs − transport)` into its day/week/month bucket. Each bucket reports whether
  any sale in it was uncosted.
- **Dashboard**: period COGS / margin = sum of FIFO `cogs` for sales in the date range.
- **Product rollups**: product margin = sum of FIFO `cogs` across that product's sales.

Each router loads all-time purchases + sales for the products in scope, calls
`computeSaleCosting` once, then filters / aggregates the result by date or product. No
caching for now; noted as a future optimization if data volume grows.

## Uncosted UX

When a sale is fully or partly uncosted:
- The sale row / detail shows a small **warning badge**: "X bags uncosted — sold more than
  purchased".
- Any trends or dashboard period containing such a sale shows a subtle warning indicator.
- Margin in those views is intentionally inflated as a visible data-quality signal.

## Testing

TDD on `fifoCosting.ts` before wiring:

- Single layer, single sale.
- The 30 / 20 / 50 split across two layers (50 @ p1, 50 @ p2) — the canonical case.
- Varying `kgPerBag` across layers — confirms per-layer cost-per-bag.
- Oversell → `uncostedBags` set, COGS excludes the excess.
- No purchases for a product → all sold bags uncosted.
- Reconciliation: sum of per-sale COGS for a product equals its rollup.

Then wire each router and update their existing tests to the FIFO basis.

## Files touched

- **New:** `app/src/server/services/fifoCosting.ts` (+ unit tests).
- **Edit:** `app/src/server/trpc/routers/sales.ts`, `trends.ts`, dashboard router.
- **Edit:** dashboard / trends / sales UI for the uncosted badge.
- **No schema changes.**

## Out of scope

- Materialized cost layers / consumption tables.
- LIFO or other costing methods.
- Caching of FIFO results.
- Multi-line invoices (current model remains one product per purchase/sale row).
