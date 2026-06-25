/**
 * FIFO margin costing.
 *
 * Sales are costed against purchases on a first-in-first-out basis, in BAGS.
 * Each purchase becomes a cost layer with its own cost-per-bag (kgPerBag x ratePerKg),
 * so layers with different kgPerBag carry their own correct cost despite per-kg pricing.
 *
 * This module is PURE — no DB access, no stored state. Callers load the full
 * transaction history for the products in scope and pass it in. The result is
 * deterministic and always correct under edits / deletes / back-dated entries.
 *
 * See docs/superpowers/specs/2026-06-26-fifo-margin-costing-design.md
 */

import Decimal from "decimal.js";
import { D, toMoney } from "./calculations";

export interface CostingPurchase {
  id: string;
  productId: string;
  date: string | Date;
  qtyBags: number;
  kgPerBag: number | string;
  ratePerKg: number | string;
  createdAt?: string | Date | null;
}

export interface CostingSale {
  id: string;
  productId: string;
  date: string | Date;
  qtyBags: number;
  createdAt?: string | Date | null;
}

export interface SaleCosting {
  /** Cost of goods sold for this sale, rounded to money. Excludes uncosted bags. */
  cogs: number;
  /** Bags that drew from a purchase layer. */
  costedBags: number;
  /** Bags sold beyond available purchased stock (no cost attributed). */
  uncostedBags: number;
}

export interface InventoryValue {
  /** Bags still in stock (never negative). */
  remainingBags: number;
  /** Cost value of the un-consumed FIFO layers, rounded to money. */
  remainingValue: number;
}

interface Layer {
  remainingBags: number;
  costPerBag: Decimal;
}

interface FifoResult {
  saleCosting: Map<string, SaleCosting>;
  inventoryByProduct: Map<string, InventoryValue>;
}

/** Sort key: date asc, then createdAt asc, then id asc — deterministic. */
function orderKey(row: { date: string | Date; createdAt?: string | Date | null; id: string }) {
  const date = new Date(row.date).getTime();
  const created = row.createdAt ? new Date(row.createdAt).getTime() : date;
  return { date, created, id: row.id };
}

function byOrder(
  a: { date: string | Date; createdAt?: string | Date | null; id: string },
  b: { date: string | Date; createdAt?: string | Date | null; id: string }
) {
  const ka = orderKey(a);
  const kb = orderKey(b);
  if (ka.date !== kb.date) return ka.date - kb.date;
  if (ka.created !== kb.created) return ka.created - kb.created;
  return ka.id < kb.id ? -1 : ka.id > kb.id ? 1 : 0;
}

/** Single FIFO pass producing both per-sale COGS and per-product remaining inventory value. */
function runFifo(purchases: CostingPurchase[], sales: CostingSale[]): FifoResult {
  const saleCosting = new Map<string, SaleCosting>();
  const inventoryByProduct = new Map<string, InventoryValue>();

  // Group purchases and sales by product.
  const purchasesByProduct = new Map<string, CostingPurchase[]>();
  for (const p of purchases) {
    const arr = purchasesByProduct.get(p.productId) ?? [];
    arr.push(p);
    purchasesByProduct.set(p.productId, arr);
  }
  const salesByProduct = new Map<string, CostingSale[]>();
  for (const s of sales) {
    const arr = salesByProduct.get(s.productId) ?? [];
    arr.push(s);
    salesByProduct.set(s.productId, arr);
  }

  // Every product that has any purchase or sale.
  const productIds = new Set<string>([...purchasesByProduct.keys(), ...salesByProduct.keys()]);

  for (const productId of productIds) {
    // Build the FIFO layer queue for this product.
    const layers: Layer[] = (purchasesByProduct.get(productId) ?? [])
      .slice()
      .sort(byOrder)
      .map((p) => ({
        remainingBags: p.qtyBags,
        costPerBag: D(p.kgPerBag).mul(D(p.ratePerKg)),
      }));

    let head = 0; // index of the current front layer

    for (const s of (salesByProduct.get(productId) ?? []).slice().sort(byOrder)) {
      let need = s.qtyBags;
      let cogs = new Decimal(0);
      let costedBags = 0;

      while (need > 0 && head < layers.length) {
        const layer = layers[head];
        const take = Math.min(need, layer.remainingBags);
        cogs = cogs.plus(layer.costPerBag.mul(take));
        costedBags += take;
        layer.remainingBags -= take;
        need -= take;
        if (layer.remainingBags === 0) head++;
      }

      saleCosting.set(s.id, {
        cogs: toMoney(cogs),
        costedBags,
        uncostedBags: need, // whatever could not be drawn from a layer
      });
    }

    // Whatever is left in the layers is on-hand inventory.
    let remainingBags = 0;
    let remainingValue = new Decimal(0);
    for (let i = head; i < layers.length; i++) {
      remainingBags += layers[i].remainingBags;
      remainingValue = remainingValue.plus(layers[i].costPerBag.mul(layers[i].remainingBags));
    }
    inventoryByProduct.set(productId, {
      remainingBags,
      remainingValue: toMoney(remainingValue),
    });
  }

  return { saleCosting, inventoryByProduct };
}

/**
 * Compute FIFO cost of goods sold for each sale.
 * @returns Map keyed by sale id.
 */
export function computeSaleCosting(
  purchases: CostingPurchase[],
  sales: CostingSale[]
): Map<string, SaleCosting> {
  return runFifo(purchases, sales).saleCosting;
}

/**
 * Value remaining on-hand stock from the un-consumed FIFO layers.
 * @returns Map keyed by product id.
 */
export function computeFifoInventoryValue(
  purchases: CostingPurchase[],
  sales: CostingSale[]
): Map<string, InventoryValue> {
  return runFifo(purchases, sales).inventoryByProduct;
}
