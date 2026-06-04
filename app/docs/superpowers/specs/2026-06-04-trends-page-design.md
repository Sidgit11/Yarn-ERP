# Trends Page — Design Spec

**Date:** 2026-06-04
**Status:** Approved, ready for implementation
**Author:** Siddhant (brainstormed with Claude)

## Problem

The dashboard shows snapshot numbers. The user can see what the margin is *right now* or for the selected month, but cannot see how it has been *trending*. They want to spot "April was great, May was weak" patterns and compare week-over-week or day-over-day movement on revenue, purchases, sales, payments.

## Goal

Add a dedicated `/trends` page with 8 bucketed charts covering the operational + financial metrics that matter day-to-day. Let the user switch between Day / Week / Month buckets and pick how far back to look.

## Non-goals (v1)

- Year bucket (the business has ~6 months of history — yearly would show 1 bar)
- Year-over-year overlays (April this year vs last)
- Drill-down by product / mill / buyer
- Click-a-bar → filter the dashboard
- Custom from/to date range (lookback presets only)
- CSV export
- Comparison mode (this month vs last)

## Route + nav

New page at `/trends`, added to the sidebar second-from-top (right after Dashboard) and to the mobile bottom-nav overflow. Icon: `LineChart` from lucide.

## Page layout

```
┌─────────────────────────────────────────────────────────────┐
│ Trends                                                       │
├─────────────────────────────────────────────────────────────┤
│ [ Day | Week | Month ]   Last [12 months ▾]                  │  ← toolbar
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐              │
│  │ Revenue            │  │ Purchase value     │              │
│  │ ▆▆▇▆▇▇█▇█▇▇▇       │  │ ▆▇▇█▇▆▇█▆▇▇▇       │              │
│  └────────────────────┘  └────────────────────┘              │
│  ┌────────────────────┐  ┌────────────────────┐              │
│  │ Gross margin ₹     │  │ Gross margin %     │              │
│  │ ▆▆▇▇█▇▇▆▇▆▇▇       │  │ ──┐  ┌─┐  ┌──      │              │
│  └────────────────────┘  └────────────────────┘              │
│  …4 more (bags x 2, payments x 2)…                           │
└─────────────────────────────────────────────────────────────┘
```

**Toolbar:**
- Bucket selector — segmented control: Day | Week | Month.
- Lookback — adapts to bucket:
  - Day: 7 / 30 / 90 (default 30)
  - Week: 8 / 13 / 26 (default 13)
  - Month: 6 / 12 / 24 (default 12)
- Toolbar is sticky at top of the page (web) and sits at the top of scroll (mobile).

**Grid:**
- Web (≥ 768px): 2 columns, charts ~360px tall.
- Mobile (< 768px): 1 column, charts ~260px tall.
- Each chart is a Card with a title and a sublabel that echoes the active bucket/lookback (so a screenshot is self-describing).

**Toolbar state persistence:**
- Bucket + lookback in `localStorage["trendsView"]`. Defaults: Month, 12.
- Independent of the dashboard date-range filter (different concept — the filter is *as-of point-in-time*, trends is *bucketed series*).

## Metrics (8 charts)

| # | Title | Chart type | Source | Notes |
|---|---|---|---|---|
| 1 | Revenue | bar | `SUM(sales.base_amount)` per bucket | Excludes GST. |
| 2 | Purchase value | bar | `SUM(purchases.base_amount)` per bucket | Excludes GST. |
| 3 | Gross margin ₹ | bar (green ≥0, red <0) | `revenue − cogs − sale_transport − broker_commission` per bucket | COGS = bag-kg × global weighted avg-cost-per-kg (keeps avgCost stable across buckets). |
| 4 | Gross margin % | line | `margin / revenue × 100` per bucket | Zero buckets render as null (line break), not 0%. |
| 5 | Bags purchased | bar | `SUM(purchases.qty_bags)` per bucket | |
| 6 | Bags sold | bar | `SUM(sales.qty_bags)` per bucket | |
| 7 | Payments received | bar | `SUM(payments.amount WHERE direction='Received')` per bucket | |
| 8 | Payments paid | bar | `SUM(payments.amount WHERE direction='Paid')` per bucket | |

**Tooltip on every chart:** shows bucket label (e.g. "Apr 2026", "Week of 1 Apr 2026", "1 Apr 2026") + the value formatted in Indian currency (or "X bags" for the bag charts).

**Zero-data buckets:** keep them in the array as 0 so the x-axis is continuous (you can spot a dead week). Margin % is the one exception — when revenue is 0, margin% returns `null` so the line breaks rather than spiking.

## Backend

### New procedure: `trends.getSeries`

```ts
trends.getSeries.useQuery({
  bucket: "day" | "week" | "month",
  lookback: number,           // count of buckets to return, e.g. 12 for "last 12 months"
})
```

The procedure:
1. Compute `from` = start-of-bucket(today) − (lookback − 1) buckets. `to` = today.
2. For each of `purchases`, `sales`, `payments`, run a single `SELECT date_trunc($1, date) AS bucket, SUM(...) FROM ... WHERE tenant=... AND deleted_at IS NULL AND date BETWEEN $from AND $to GROUP BY bucket`.
3. For COGS, compute the global weighted `avgCostPerKg` from all-time purchases (one query). Use that same scalar across every bucket so April margin uses real cost basis even if April had few purchases.
4. Build a continuous array of `lookback` buckets (filling 0 for empty buckets), then assemble the 8 series.

Returns:

```ts
{
  buckets: string[];          // ISO date of bucket start, in order
  bucketLabels: string[];     // human labels: "Apr 2026" / "Wk of 1 Apr" / "1 Apr"
  revenue:           number[];
  purchaseValue:     number[];
  margin:            number[];
  marginPct:         (number | null)[];
  bagsPurchased:     number[];
  bagsSold:          number[];
  paymentsReceived:  number[];
  paymentsPaid:      number[];
}
```

Parallel queries; expected total time < 200ms even at a few thousand rows.

### Bucket boundary semantics

- **Day**: bucket = the calendar day in the project's timezone (Asia/Dubai → app uses local Indian time; we store dates as `date` not `timestamp`, so this is naturally calendar-day).
- **Week**: bucket = ISO week (Monday start). `date_trunc('week', ...)` in Postgres uses Monday.
- **Month**: bucket = calendar month, 1st of the month.

## Library — Recharts

- Install `recharts` as a dependency (~90KB gzipped).
- Use the `<ResponsiveContainer>` + `<BarChart>` / `<LineChart>` primitives.
- Custom tooltip component so it matches the rest of the app's visual language (Indian currency formatter, the existing card border/shadow).

## Files

**New:**
- `src/app/(dashboard)/trends/page.tsx` — page shell, toolbar, grid.
- `src/components/shared/trend-chart.tsx` — single reusable chart wrapper. Props: `title`, `series`, `buckets`, `bucketLabels`, `kind: "bar" | "line"`, `format: "currency" | "bags" | "percent"`, `colorPositive?`, `colorNegative?`.
- `src/lib/useTrendsView.ts` — localStorage-backed hook for { bucket, lookback }.
- `src/server/trpc/routers/trends.ts` — `getSeries` procedure.

**Modified:**
- `src/components/layout/sidebar.tsx` — add Trends item below Dashboard.
- `src/components/layout/bottom-nav.tsx` — add Trends item in overflow menu.
- `src/server/trpc/root.ts` (or `_app.ts` — appRouter) — register `trends`.
- `package.json` — add `recharts`.

## Edge cases

- **No txns in lookback window** → page shows the toolbar + 8 empty charts with axes but no bars (Recharts handles this gracefully). A small "No data in this window" note appears inside each chart.
- **Single bucket of data** → one bar; chart still renders. No special handling.
- **All-time avgCost = 0** (no purchases) → margin = revenue − transport − commission. Don't crash on divide-by-zero. (Already the case in the existing dashboard code.)
- **Bucket count > 90 (e.g. day × 90)** → labels would crowd. Recharts' `tickFormatter` thins automatically. Still ship 90-day default → 90 daily bars.
- **Time zone**: Postgres `date_trunc` uses session TZ. We store transaction date as a `date` (no time component), so trunc is a no-op for day buckets. Week and month grouping happen in UTC by default but date columns aren't TZ-affected. Acceptable for v1.

## Testing

- Manual smoke: open `/trends`, see 8 charts. Switch bucket → all 8 reflow. Switch lookback → window changes. Reload → toolbar state restored.
- Manual spot-check: pick Month + 12. Verify the rightmost bar of "Revenue" equals the dashboard's current-month revenue when the dashboard filter is "This Month".
- Manual cross-page: Trends and Dashboard should agree on April 2026's revenue when both are set to April.

## Success criteria

1. User opens `/trends` and sees 8 charts populated with their last 12 months of data.
2. Switching to Week shows 13 weekly bars.
3. Switching to Day shows 30 daily bars.
4. Lookback dropdown changes the window without re-running the bucket choice.
5. Toolbar selection survives a reload.
6. Page is fully usable on mobile (1-col stack, sticky-ish toolbar, 44px tap targets).
