/**
 * DB glue for coaching insights. Loads the tenant's full purchase/sale history once
 * (FIFO needs it), reuses computeFifoAllocations for per-sale COGS + remaining lots,
 * and shapes everything into the pure coaching.ts inputs. Compute-on-the-fly.
 */
import { and, eq, isNull } from "drizzle-orm";
import { config, products, purchases, sales, contacts } from "../db/schema";
import { computeFifoAllocations } from "./fifoCosting";
import { D, toMoney } from "./calculations";
import {
  resolveFloor,
  computeBusinessAvgMargin,
  FLOOR_BUFFER_PP,
  type CoachingSale,
  type RemainingLot,
} from "./coaching";

const ALLOC_PURCHASE_COLS = {
  id: purchases.id,
  productId: purchases.productId,
  date: purchases.date,
  qtyBags: purchases.qtyBags,
  kgPerBag: purchases.kgPerBag,
  ratePerKg: purchases.ratePerKg,
  createdAt: purchases.createdAt,
  displayId: purchases.displayId,
};

const ALLOC_SALE_COLS = {
  id: sales.id,
  productId: sales.productId,
  date: sales.date,
  qtyBags: sales.qtyBags,
  kgPerBag: sales.kgPerBag,
  ratePerKg: sales.ratePerKg,
  createdAt: sales.createdAt,
  displayId: sales.displayId,
  buyerId: sales.buyerId,
};

const PRODUCT_COLS = {
  id: products.id,
  millBrand: products.millBrand,
  fibreType: products.fibreType,
  count: products.count,
  qualityGrade: products.qualityGrade,
  colorShade: products.colorShade,
  marginFloorPct: products.marginFloorPct,
};

function productLabel(p: {
  millBrand: string;
  fibreType: string;
  count: string;
  qualityGrade: string;
  colorShade?: string | null;
}): string {
  return `${p.millBrand} ${p.fibreType} ${p.count} ${p.qualityGrade}${p.colorShade ? ` ${p.colorShade}` : ""}`;
}

export async function loadCoachingData(
  db: any,
  tenantId: string,
  range: { from?: string; to?: string }
) {
  const [cfg, productRows, purchaseRows, saleRows, contactRows] = await Promise.all([
    db.select().from(config).where(eq(config.tenantId, tenantId)).then((r: any[]) => r[0]),
    db.select(PRODUCT_COLS).from(products).where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt))),
    db.select(ALLOC_PURCHASE_COLS).from(purchases).where(and(eq(purchases.tenantId, tenantId), isNull(purchases.deletedAt))),
    db.select(ALLOC_SALE_COLS).from(sales).where(and(eq(sales.tenantId, tenantId), isNull(sales.deletedAt))),
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(eq(contacts.tenantId, tenantId)),
  ]);

  const productNames = new Map<string, string>();
  const productOverrideMap = new Map<string, number | null>();
  for (const p of productRows) {
    productNames.set(p.id, productLabel(p));
    productOverrideMap.set(p.id, p.marginFloorPct != null ? Number(p.marginFloorPct) : null);
  }

  const buyerNameMap = new Map<string, string>();
  for (const c of contactRows) buyerNameMap.set(c.id, c.name);

  const alloc = computeFifoAllocations(purchaseRows, saleRows);

  const cogsBySale = new Map<string, number>();
  for (const dw of alloc.draws) {
    cogsBySale.set(dw.saleId, (cogsBySale.get(dw.saleId) ?? 0) + dw.bags * dw.costPerBag);
  }

  const from = range.from ?? null;
  const to = range.to ?? null;
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to);

  const windowSales: CoachingSale[] = [];
  for (const s of saleRows) {
    const dateIso = String(s.date).slice(0, 10);
    if (!inRange(dateIso)) continue;
    const totalKg = toMoney(D(s.qtyBags).mul(D(s.kgPerBag)));
    const revenue = toMoney(D(s.qtyBags).mul(D(s.kgPerBag)).mul(D(s.ratePerKg)));
    windowSales.push({
      id: s.id,
      displayId: s.displayId,
      productId: s.productId,
      buyerId: s.buyerId,
      buyerName: buyerNameMap.get(s.buyerId) ?? "Unknown",
      date: dateIso,
      revenue,
      cogs: toMoney(D(cogsBySale.get(s.id) ?? 0)),
      totalKg,
      uncostedBags: alloc.uncostedBySale.get(s.id) ?? 0,
    });
  }

  const businessAvgPct = computeBusinessAvgMargin(windowSales);
  const autoFloorPct = businessAvgPct + FLOOR_BUFFER_PP;
  const globalOverride = cfg?.targetMarginFloorPct != null ? Number(cfg.targetMarginFloorPct) : null;

  const floorByProduct = new Map<string, number>();
  for (const p of productRows) {
    floorByProduct.set(
      p.id,
      resolveFloor({
        productOverride: productOverrideMap.get(p.id) ?? null,
        globalOverride,
        businessAvgPct,
      })
    );
  }

  const purchaseByDisplayId = new Map<string, (typeof purchaseRows)[0]>();
  for (const p of purchaseRows) purchaseByDisplayId.set(p.displayId, p);

  const remainingLots: RemainingLot[] = [];
  for (const [displayId, bags] of alloc.remainingByLot) {
    if (bags <= 0) continue;
    const p = purchaseByDisplayId.get(displayId);
    if (!p) continue;
    remainingLots.push({
      productId: p.productId,
      productName: productNames.get(p.productId) ?? p.productId,
      purchaseId: p.id,
      purchaseDisplayId: displayId,
      purchaseDate: String(p.date).slice(0, 10),
      remainingBags: bags,
      costPerBag: toMoney(D(p.kgPerBag).mul(D(p.ratePerKg))),
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    windowSales,
    remainingLots,
    businessAvgPct,
    autoFloorPct,
    globalOverride,
    floorByProduct,
    productNames,
    today,
  };
}
