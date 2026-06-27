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
