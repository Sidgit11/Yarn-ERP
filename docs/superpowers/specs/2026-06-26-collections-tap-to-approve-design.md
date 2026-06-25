# Collections — Tap-to-Approve Inbox — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

The primary user (the owner's brother) dislikes manual data entry. Recording each
collection today means filling the full payment form (party, direction, amount, mode,
against-transaction, etc.). As a result, collections go unrecorded or lag reality.

He *is* willing to **glance at what buyers owe and confirm what he knows came in** — as
long as it takes almost no typing.

## Goal

A **Collections inbox** where recording a payment is reduced to *confirming* a draft the
system already prepared, not *entering* one. Lower the cost to the act of typing — **not**
the act of judgment.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Input source | **Tap-to-approve** from existing outstanding data — no uploads | User's explicit choice; reuses `ledger.list` / `openTransactions`. |
| Mental model | Support **both** lump-sum-per-party (FIFO allocation) and specific-invoice | User: "both, depends." |
| Direction | **Collections only** (money received from buyers) | User's explicit scope. Paying mills stays on the existing form. |
| Mode entry | Default **Bank/NEFT**, one-tap **batch-level** switch (UPI/Cheque/Cash/RTGS) | User-approved. Avoids per-payment mode picking. |
| Overpayment | **Cap at outstanding with a warning** in v1 (no on-account advance) | User-approved. Keeps v1 simple. |
| Devices | **Laptop and phone** equally first-class (responsive) | User constraint. |
| Anti-abuse | **No mass-approve**; every action shows a real amount; mandatory review | User constraint: must not become mindless "log everything as paid." |

## Guiding principle

**The feature removes typing, not judgment.** He still makes one deliberate decision per
party — "did this buyer actually pay?" — and the system only removes the data-entry tax
that follows. We deliberately ship **no** "settle everyone" shortcut.

## Screen & flow

A new **Collections** screen, reached from the dashboard "They owe you" card and the
Payments page. The existing manual payment form is left untouched (used for paying
mills/brokers and any edge case).

1. **List** — every buyer with an outstanding receivable, sorted **overdue-first, then
   largest balance**. Each row: party name, total owed, number of open bills, overdue
   badge. Source: `ledger.list` (receivables + overdue) with per-invoice detail from
   `openTransactions`.
2. **Tap a party → three settlement paths**, all low-friction:
   - **"Received full ₹X"** — one tap; settles the party's entire outstanding.
   - **Amount box** — type the amount received; it auto-applies **oldest bill first
     (FIFO)** and previews which bills clear fully/partly.
   - **Pick bills** — expand and tap specific invoices (each defaults to its full balance,
     editable) for the specific-invoice case.
3. **Basket** — each settlement is staged into a basket with a running **count + total**.
   A basket entry is **one party's settlement** (it may expand to several linked payment
   rows on save, one per bill the FIFO allocation touched). He can process several parties,
   then confirm once. Editing or removing a basket entry before confirming is free.
4. **Confirmation card** — lists every drafted collection (party · bill(s) · amount ·
   today's date) plus two batch-level controls: **mode** (default Bank/NEFT) and **via CC**
   (default on — received money reduces the CC draw, mirroring the current form). Then
   **"Record N collections."**
5. **Success** — toast with details and updated balance ("Recorded 4 collections totaling
   ₹6.2L; Ramesh now clear") and **Undo**.

## Responsive UX

Same components, responsive layout (Tailwind breakpoints); 48px minimum touch targets and
12px card radius per the design guide.

- **Laptop:** expandable party list with a **persistent basket panel** (side or sticky);
  keyboard support (tab between parties, enter to stage, amount fields focusable).
- **Phone:** single column; tap-to-expand a party; a **sticky bottom bar** showing basket
  count + total with the primary "Review" action in thumb reach; full-screen confirmation
  sheet.

## Anti-mindless safeguards

- **No "mark all" / "select all" control.** Every party is an individual, deliberate tap.
- **Every action shows a concrete number** ("Received full ₹2,40,000"), never an abstract
  "Paid ✓" — he affirms an amount, not a checkbox.
- **Stage → review → confirm.** Nothing is written until he sees the basket list and the
  grand total on the confirmation card. Larger batches surface a larger total.
- **Cheap but visible reversal.** Undo on the toast; every record lands in the payments
  list and is soft-deletable, so mistakes are fixable and auditable, not hidden.

## Allocation logic (pure, tested)

`allocateCollection(openBills, amount)` — given a party's open bills (sorted oldest-first)
and an amount, return the per-bill amounts. Fills oldest bills fully; the last touched bill
may be partial. Each resulting settlement becomes **one payment row linked to its sale via
`againstTxnId`**, so all existing pending/ledger math continues to work unchanged.

- Exact settle → each bill cleared.
- Lump sum across bills → FIFO fill, partial tail.
- Overpay → capped at total outstanding (excess ignored, warned in UI).

## Backend

One new batch mutation: `payments.recordCollections(items[])`, where each item is
`{ saleDisplayId, partyId, amount, date, mode, viaCC, reference? }`.

- Runs in a single DB transaction; reuses the existing CC-entry creation (when `viaCC`).
- **Re-checks each bill's current balance at save time and caps the allocation to it** — a
  stale screen can never overpay or double-record. Bills already settled since load are
  skipped and reported back.
- Returns a summary (recorded count, total, skipped bills) for the success toast.

## Testing

- TDD `allocateCollection`: exact settle, lump sum across bills, partial tail, overpay cap,
  zero/edge amounts.
- Batch mutation: balance re-validation (stale/already-settled bill skipped), CC entry
  created when `viaCC`, per-invoice linkage via `againstTxnId`.

## Out of scope (v1)

- Any file upload (bank statement, Tally, SMS) — separate future input sources can feed the
  same inbox later.
- Paying mills / brokers / transporters (money out).
- On-account / advance credit for overpayments.
- Editing an already-recorded collection from this screen (use the existing payment form).
