/**
 * DB glue for FIFO costing. Loads the full (all-time) purchase + sale history
 * needed to compute FIFO COGS, then delegates to the pure `fifoCosting` service.
 *
 * FIFO is inherently sequential per product, so even a date-filtered view must
 * replay the entire history of the products in scope to know which cost layers
 * each sale draws from. We therefore always load all-time rows (optionally
 * scoped to a set of product ids).
 */

import { and, eq, isNull, inArray } from "drizzle-orm";
import { purchases, sales } from "../db/schema";
import {
  computeSaleCosting,
  computeFifoInventoryValue,
  type SaleCosting,
  type InventoryValue,
} from "./fifoCosting";

const PURCHASE_COLS = {
  id: purchases.id,
  productId: purchases.productId,
  date: purchases.date,
  qtyBags: purchases.qtyBags,
  kgPerBag: purchases.kgPerBag,
  ratePerKg: purchases.ratePerKg,
  createdAt: purchases.createdAt,
};
const SALE_COLS = {
  id: sales.id,
  productId: sales.productId,
  date: sales.date,
  qtyBags: sales.qtyBags,
  createdAt: sales.createdAt,
};

async function loadHistory(db: any, tenantId: string, productIds?: string[]) {
  const purchaseFilters = [eq(purchases.tenantId, tenantId), isNull(purchases.deletedAt)];
  const saleFilters = [eq(sales.tenantId, tenantId), isNull(sales.deletedAt)];
  if (productIds && productIds.length > 0) {
    const unique = [...new Set(productIds)];
    purchaseFilters.push(inArray(purchases.productId, unique));
    saleFilters.push(inArray(sales.productId, unique));
  }
  const [purchaseRows, saleRows] = await Promise.all([
    db.select(PURCHASE_COLS).from(purchases).where(and(...purchaseFilters)),
    db.select(SALE_COLS).from(sales).where(and(...saleFilters)),
  ]);
  return { purchaseRows, saleRows };
}

/** Map of sale id → FIFO costing. Scope to `productIds` to limit the history loaded. */
export async function loadSaleCostingMap(
  db: any,
  tenantId: string,
  productIds?: string[]
): Promise<Map<string, SaleCosting>> {
  const { purchaseRows, saleRows } = await loadHistory(db, tenantId, productIds);
  return computeSaleCosting(purchaseRows, saleRows);
}

/** Map of product id → remaining FIFO inventory value (all products in tenant). */
export async function loadFifoInventoryMap(
  db: any,
  tenantId: string
): Promise<Map<string, InventoryValue>> {
  const { purchaseRows, saleRows } = await loadHistory(db, tenantId);
  return computeFifoInventoryValue(purchaseRows, saleRows);
}
