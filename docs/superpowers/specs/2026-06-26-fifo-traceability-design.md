# FIFO Traceability at Touchpoints — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

FIFO costing now drives margins, but the user can't *see* how a sale was costed —
which purchase lot(s) fulfilled it, at what cost. When a sale shows a loss (e.g. S319 at
−11.3%), the only way to understand it today is to query the database by hand. The user
wants this traceability surfaced **in the app**, as "the right amount of relevant
information at relevant touchpoints" — not one mega-screen and not a separate standalone
tool.

## Goal

Expose the FIFO lot↔sale matching across the product, driven by a single computation so
the numbers never disagree between screens. Each entity shows its own slice:

- A **sale** shows which lots fulfilled it and at what cost.
- A **purchase lot** shows which customers/sales consumed it and what remains.
- A **product** shows the full lot→sale ledger and per-customer margins.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Surface | Relevant slice at each existing touchpoint (sale, purchase, product) — no standalone page | User: "right amount of relevant info at relevant touchpoints." |
| Source of truth | One pure `computeFifoAllocations` pass; every view filters its draws | Numbers can't disagree across screens. |
| Heavy views | **Lazy** — lot breakdown loads when a sale/purchase row is expanded | Keeps list payloads fast (user-approved). |
| Product lot ledger | **Collapsed by default** | "There when wanted, not in the way" (user-approved). |
| Customer-level page | Out of scope; product page's per-customer rollup covers it | YAGNI. |

## Architecture

### Engine — one source of truth

Extend `app/src/server/services/fifoCosting.ts` with:

```
computeFifoAllocations(purchases, sales) → {
  draws: Draw[];                                  // every sale↔lot pairing
  remainingByLot: Map<purchaseDisplayId, number>; // bags still in stock per lot
}

Draw = {
  saleId, saleDisplayId, buyerId,
  purchaseId, purchaseDisplayId,                  // the lot
  bags, costPerBag, ratePerKg, purchaseDate
}
```

It is the same FIFO pass that already computes COGS (`computeSaleCosting`), refactored so
both share one internal walk. Each draw records which sale took how many bags from which
lot at what cost. Per-sale `uncostedBags` (sold beyond purchased stock) is preserved.

Pure — no DB. Deterministic. Reuses the existing ordering (date → createdAt → id).

### Derivations (all filters over `draws`)

- **Sale → fulfilled from:** `draws.filter(d => d.saleId === X)`, grouped by lot.
- **Lot → sold to:** `draws.filter(d => d.purchaseDisplayId === L)`, grouped by sale/buyer;
  remaining from `remainingByLot`.
- **Product ledger:** all draws for the product, ordered oldest-lot-first.
- **Customer margins:** join draws → sale → buyer; sum cost per buyer; combine with the
  per-buyer revenue already computed in `products.getDetail`.

### Backend

- New DB helper `loadProductAllocations(db, tenantId, productId)` — loads the product's
  all-time non-deleted purchases + sales and runs `computeFifoAllocations`.
- **Lazy endpoints** for the Sales/Purchases **list** pages (called only on row expand, so
  list payloads stay lean):
  - `sales.fulfilledFrom({ saleId })` → that sale's lot draws + uncosted bags.
  - `purchases.soldTo({ purchaseId })` → that lot's consumers (customer · sale · bags) +
    remaining-in-stock.
- **`products.getDetail`** already loads the product's full history, so the ledger, the
  per-customer enrichment, **and the recent-sales "fulfilled from"** are all computed inline
  there (no extra round-trip; the lazy endpoints are only for the list pages).

## Touchpoint UX

Right-sized; mobile-friendly (48px targets, collapsibles).

- **Sale → "Fulfilled from"** — appended to the existing margin breakdown on the Sales
  detail card and the product page's recent-sales rows. Example:
  *"42 bags · P114 @ ₹315/kg · 6 bags · P115 @ ₹270/kg."* Shows an uncosted flag when bags
  were sold beyond stock.
- **Purchase lot → "Sold to"** — a collapsible block in the expanded Purchases detail card:
  *"50 bags → 12 NT Fabrics (S319) · 36 Mohsin (S321) · 14 still in stock."*
- **Product → Lot ledger** — a collapsible "Stock flow" section on the product detail page:
  the lot→sale(customer) table, oldest-lot-first, with the oversold tail surfaced. Default
  collapsed.
- **Product → Customer margins** — the existing per-buyer breakdown gains **avg FIFO
  cost/kg** and the lots each customer drew from, beside the margin already shown.

## Testing

TDD `computeFifoAllocations`:

- The 30/20/50 split produces the expected per-lot draws.
- A single sale spanning two lots splits correctly.
- `remainingByLot` reflects un-consumed bags.
- Oversold tail → the excess appears as the sale's `uncostedBags`, not a phantom draw.
- Multi-product isolation.
- **Reconciliation:** for each sale, `Σ(draw.bags × draw.costPerBag)` equals that sale's
  `cogs` from `computeSaleCosting`.

## Files touched

- **Edit:** `fifoCosting.ts` (add `computeFifoAllocations`, share the FIFO walk) + tests.
- **New:** `loadProductAllocations` DB helper (alongside `fifoCostingDb.ts`).
- **Edit:** `sales.ts` (`fulfilledFrom`), `purchases.ts` (`soldTo`), `products.ts`
  (`getDetail` ledger + per-customer enrichment).
- **Edit:** Sales detail UI, Purchases detail UI, product detail UI.

## Out of scope (v1)

- A standalone traceability page.
- A dedicated customer/contact margin screen.
- CSV/PDF export of the ledger.
- Changing the costing method (FIFO stays as-is).
