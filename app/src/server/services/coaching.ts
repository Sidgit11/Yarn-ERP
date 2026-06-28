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
    // Guard: a floor >= 100 makes revenueAtFloor = cogs/(1-floor/100) divide by zero → Infinity.
    // A floor < 0 is nonsensical. Skip the sale rather than produce garbage output.
    if (floor >= 100 || floor < 0) continue;
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
