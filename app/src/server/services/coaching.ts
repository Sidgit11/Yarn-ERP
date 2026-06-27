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
