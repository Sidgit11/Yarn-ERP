/**
 * Collections allocation.
 *
 * Given a buyer's open bills (sorted oldest-first by the caller) and an amount
 * received, distribute the amount across the bills oldest-first (FIFO). Each
 * bill fills up to its balance; the last touched bill may be partial. Any amount
 * beyond the total outstanding is ignored (capped) — the UI warns about it.
 *
 * Pure: no DB, money-safe via Decimal. Used by the Collections tap-to-approve
 * inbox. See docs/superpowers/specs/2026-06-26-collections-tap-to-approve-design.md
 */

import { D, toMoney } from "./calculations";

export interface OpenBill {
  displayId: string;
  balance: number;
}

export interface Allocation {
  displayId: string;
  amount: number;
}

export function allocateCollection(bills: OpenBill[], amount: number): Allocation[] {
  const allocations: Allocation[] = [];
  let remaining = D(amount);

  for (const bill of bills) {
    if (remaining.lte(0)) break;
    const take = remaining.lt(bill.balance) ? remaining : D(bill.balance);
    if (take.lte(0)) continue;
    allocations.push({ displayId: bill.displayId, amount: toMoney(take) });
    remaining = remaining.minus(take);
  }

  return allocations;
}

export interface CurrentBalance {
  displayId: string;
  balance: number;
}

export type SkipReason = "not_found" | "settled";

export interface BatchResult {
  toRecord: Allocation[];
  skipped: { displayId: string; reason: SkipReason }[];
}

/**
 * Re-validate client-submitted allocations against the bills' CURRENT balances.
 * Caps each item to what's still owed, skips missing or already-settled bills,
 * and accounts for multiple allocations to the same bill within one batch.
 */
export function capBatchToBalances(
  items: Allocation[],
  balances: CurrentBalance[]
): BatchResult {
  const balanceByDisplay = new Map(balances.map((b) => [b.displayId, b.balance]));
  // Track how much of each bill has already been consumed earlier in this batch.
  const consumed = new Map<string, ReturnType<typeof D>>();

  const toRecord: Allocation[] = [];
  const skipped: { displayId: string; reason: SkipReason }[] = [];

  for (const item of items) {
    if (!balanceByDisplay.has(item.displayId)) {
      skipped.push({ displayId: item.displayId, reason: "not_found" });
      continue;
    }
    const already = consumed.get(item.displayId) ?? D(0);
    const available = D(balanceByDisplay.get(item.displayId)!).minus(already);
    if (available.lte(0)) {
      skipped.push({ displayId: item.displayId, reason: "settled" });
      continue;
    }
    const take = D(item.amount).gt(available) ? available : D(item.amount);
    if (take.lte(0)) {
      skipped.push({ displayId: item.displayId, reason: "settled" });
      continue;
    }
    toRecord.push({ displayId: item.displayId, amount: toMoney(take) });
    consumed.set(item.displayId, already.plus(take));
  }

  return { toRecord, skipped };
}
