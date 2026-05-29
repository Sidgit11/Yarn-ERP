# Date Range Filter — Design Spec

**Date:** 2026-05-29
**Status:** Approved, ready for implementation plan
**Author:** Siddhant (brainstormed with Claude)

## Problem

The dashboard and list pages show all-time aggregates. The user (Sarthak) needs to see "what happened in April" or "May margins" without exporting to Excel. He currently can't answer "how much did we sell in April" inside the app.

## Goal

Add a date range filter to the Dashboard, Purchases list, Sales list, and Payments list. The filter must use the **transaction date** (`date` column), not the entry date (`created_at`). The selected range persists across pages.

## Non-goals (v1)

- Filtering CC ledger by range (CC is inherently a running-balance view)
- Filtering Products, Contacts, Recon pages
- Comparison views (April vs May side-by-side)
- Date ranges that span fiscal year boundaries with special handling

## The "as-of vs period" split

Not every dashboard number is period-shaped.

- **Period metrics** — meaningful inside a date window: Revenue, COGS, gross/net margin, expenses, GST input/output, transport, purchase count, sale count, broker commission.
- **As-of metrics** — only meaningful as "right now": CC outstanding, CC money trail (stock-at-cost, transport, overpaid-to-mills), payables (mills/brokers/transporters), receivables, stock-in-hand, negative-inventory data-issue.

The filter affects period metrics only. As-of cards show today's number regardless of the picker. When the picker is anything other than "All Time", an "As of today" pill appears next to the title of each as-of card so the user knows why those numbers don't move.

## UI — `<DateRangePicker />` component

A single reusable picker rendered in the page header of Dashboard / Purchases / Sales / Payments. Exact positioning (right-of-H1 on web, below H1 on mobile) is specified in the Visibility section below.

### Closed state

```
Showing: [April 2026 ▾]
```

### Open state

```
● All Time
  This Month (May 2026)
  Last Month (Apr 2026)
  Mar 2026
  Feb 2026
  …  (12 months back from today)
  ─────────────
  Custom range…  →  opens From / To date inputs
```

### Behavior

- Default when no prior selection in `localStorage`: **This Month**. Once the user changes it, that choice is remembered across sessions (we do not reset to "This Month" each session).
- Selecting a month preset sets `from = month-start`, `to = month-end` (inclusive).
- "All Time" sends no `from` / `to` to the server (existing behavior).
- "Custom range…" reveals two `<input type="date">` fields; on Apply, the range is used.
- Selection lives in `localStorage` under the key `dateRange`. All four pages read the same key, so changing the range on Dashboard updates Purchases/Sales/Payments the next time they mount.

### "As of today" pill

On the dashboard, when the active range is anything other than All Time, every as-of card gets a small gray pill `As of today` next to its title (12px, gray-500 on gray-100 bg, rounded). When range is All Time, the pill is hidden — no clutter when filter is off.

### Visibility — picker + active range must be unmistakable on every screen

Risk to avoid: user picks "April 2026", scrolls down on the dashboard, and forgets the data is filtered — they then misread May totals as April or vice versa.

Three visibility guarantees:

1. **Picker is always reachable.** On the page header row (next to the page title `Dashboard` / `Purchases` etc.). Position is consistent across all four pages so muscle memory works.
   - **Web (≥ 768px):** picker sits on the same row as the H1, right-aligned. Visible the moment you load.
   - **Mobile (< 768px):** picker sits *below* the H1 on its own full-width row (not crammed into the H1 row where it would shrink or wrap awkwardly). Full-width button with the current range label so it's hard to miss.

2. **Active-range banner under the H1 — only when not All Time.** A single-line subtitle like `Showing data for April 2026` in a tinted strip (blue-50 bg, blue-700 text) directly under the page title. It is part of the page header so it scrolls with content, but it's the first thing the user sees on load and the first thing under H1 on every screen.
   - On the dashboard, the same line adds: `Cards marked "As of today" are not filtered.` so the split is explicit, not hidden.
   - When range = All Time, the banner is hidden entirely.

3. **Empty-state copy includes the range** ("No sales in April 2026"). So even when the list is empty, the user knows *why*.

Mobile-specific: the picker dropdown opens as a full-width sheet anchored to the picker button (not a tiny popover near the corner), tap targets ≥ 48px per the design guide.

## State management

### Hook: `useDateRange()`

Returns:

```ts
{
  preset: "all" | "this-month" | "last-month" | `month:${YYYY-MM}` | "custom",
  from: string | null,   // ISO date, null = no lower bound
  to: string | null,     // ISO date, null = no upper bound
  setPreset(preset): void,
  setCustom(from, to): void,
  // for the server query input
  serverInput: { from?: string; to?: string }
}
```

Backed by `localStorage["dateRange"]`. Storage shape:

```ts
type StoredRange =
  | { preset: "all" }
  | { preset: "this-month" | "last-month" }
  | { preset: `month:${string}` }  // e.g. "month:2026-04"
  | { preset: "custom"; from: string; to: string };
```

`this-month` / `last-month` / `month:YYYY-MM` are resolved to concrete `from`/`to` on read (not stored) so they stay correct as the calendar advances. Only `custom` stores explicit `from`/`to`. On first ever load (no value in storage), defaults to `this-month`. Subsequent sessions remember the last choice.

**Cross-page sync:** the hook reads `localStorage` on mount and writes on every change. Within a single tab, all four pages share state because the picker is mounted in each page header — when one page changes the value, the others pick it up on their next mount/query. We do not subscribe to the `storage` event (which only fires across tabs and is not needed for v1).

### Date math

A small `src/lib/dateRange.ts` file:

- `monthOptions(n: number): { label: string; preset: string; from: string; to: string }[]` — generates the dropdown's month list (current month, then N months back).
- `presetToRange(preset: string): { from: string; to: string } | null` — resolves a preset to a concrete range. Returns `null` for "all".
- `formatRangeLabel(preset, from, to): string` — for the closed-state button text ("April 2026", "All Time", "1 Apr – 15 Apr 2026").

## Backend wiring

### Shared input type

```ts
const dateRangeInput = z.object({
  from: z.string().optional(),  // ISO date, inclusive
  to:   z.string().optional(),  // ISO date, inclusive
}).optional();
```

### Affected procedures

| Procedure | Change |
|---|---|
| `dashboard.getMetrics` | Accepts optional `{ from, to }`. Period aggregates filter rows by `date BETWEEN from AND to`. As-of aggregates still use all rows. |
| `purchases.list` | Accepts optional `{ from, to }`. Filters `purchases.date`. Summary chips computed off the same filtered set. |
| `sales.list` | Same — filters `sales.date`. |
| `payments.list` | Same — filters `payments.date`. |

### Implementation pattern inside `dashboard.getMetrics`

Two passes:

1. Load all rows (unchanged — needed for as-of metrics).
2. Compute a `withinRange(date)` predicate at the top of the procedure.
3. Inside the existing aggregation loops, gate period-metric accumulations on `withinRange(row.date)`. As-of accumulations stay as-is.

This keeps the change localized — no SQL-level WHERE-clause changes for the dashboard, just an in-loop filter. The dashboard already loads all rows in parallel; the extra filter is microseconds.

For list procedures (`purchases.list`, `sales.list`, `payments.list`), the filter goes into the SQL `WHERE` clause so we don't ship more rows than needed.

## Edge cases

- **Empty result inside range** — pages show "No sales in April 2026" (range-aware copy), not generic "No sales yet".
- **Custom range with `from > to`** — disable Apply button. No server validation needed (UI prevents it).
- **Server-side guardrail** — if `from > to` slips through anyway, the procedure treats it as "no rows" rather than erroring.
- **Bad data dates** (like S107's year-0004) — already covered by the date-out-of-range warning shipped today; doesn't affect filter logic.

## Files touched

**New:**
- `src/components/DateRangePicker.tsx` — the picker UI.
- `src/lib/useDateRange.ts` — the hook (localStorage-backed).
- `src/lib/dateRange.ts` — date math helpers.

**Modified — server:**
- `src/server/trpc/routers/dashboard.ts` — `getMetrics` takes range; gates period metrics.
- `src/server/trpc/routers/purchases.ts` — `list` takes range; WHERE filter.
- `src/server/trpc/routers/sales.ts` — `list` takes range.
- `src/server/trpc/routers/payments.ts` — `list` takes range.

**Modified — pages:**
- `src/app/(dashboard)/page.tsx` — render picker; pass range into query; "As of today" pill on as-of cards.
- `src/app/(dashboard)/purchases/page.tsx` — picker; pass range; range-aware empty state.
- `src/app/(dashboard)/sales/page.tsx` — picker; pass range; range-aware empty state.
- `src/app/(dashboard)/payments/page.tsx` — picker; pass range; range-aware empty state.

## Testing

- Manual: pick April from dashboard, navigate to Sales — should still be April. Reload — still April. Pick "All Time" — pills disappear, all-time numbers return.
- Manual: pick a month with zero data — empty states show the right month name.
- Verification: April-2026 revenue from dashboard === sum of Sales-page total-value chip when both filtered to April.

## Out of scope (deferred)

- URL-param sync (would enable shareable links + browser back/forward through ranges). LocalStorage is enough for v1.
- "This Quarter" / "This FY" presets. Easy to add later if asked.
- Server-side validation of date format beyond what zod does.
- CC ledger / Products / Contacts / Recon filters.
- Comparison mode.

## Success criteria

1. User picks "April 2026" on the dashboard. Margins/revenue/COGS/expenses/counts all reflect April. CC, payables, receivables, stock-in-hand show today's numbers with "As of today" pill.
2. User navigates to Sales — already filtered to April. List + summary chips show April only.
3. User picks "All Time" — everything returns to pre-feature behavior. No "As of today" pills shown.
4. Reload preserves selection.
