/**
 * Shared business logic for SYT ERP.
 *
 * ALL financial calculations live here. Routers and UI must call these
 * functions instead of reimplementing formulas. Uses Decimal.js to avoid
 * IEEE-754 floating-point errors on money amounts.
 */

import Decimal from "decimal.js";

// Configure Decimal for financial use — 20 significant digits, ROUND_HALF_UP
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ────────────────────────────────────────────────────────────────────────────
// Type helpers — raw DB rows come in as strings for NUMERIC columns.
// ────────────────────────────────────────────────────────────────────────────

/** Safely parse a string | number | null into a Decimal. Returns Decimal(0) on null/undefined. */
export function D(v: string | number | null | undefined): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  return new Decimal(v);
}

/** Round a Decimal to 2 decimal places and return as number (for JSON serialisation). */
export function toMoney(d: Decimal): number {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

// ────────────────────────────────────────────────────────────────────────────
// Purchase calculations
// ────────────────────────────────────────────────────────────────────────────

export interface PurchaseTotals {
  totalKg: number;
  baseAmount: number;
  gstAmount: number;
  totalInclGst: number;
  grandTotal: number;
}

/**
 * Compute derived totals for a purchase row.
 * grandTotal = base + gst + transport (transport is a line item for purchases).
 */
export function computePurchaseTotals(row: {
  qtyBags: number;
  kgPerBag: number | string;
  ratePerKg: string;
  gstPct: string;
  transport: string;
}): PurchaseTotals {
  const totalKg = row.qtyBags * Number(row.kgPerBag);
  const rate = D(row.ratePerKg);
  const base = rate.mul(totalKg);
  const gst = base.mul(D(row.gstPct)).div(100);
  const totalInclGst = base.plus(gst);
  const grandTotal = totalInclGst.plus(D(row.transport));

  return {
    totalKg,
    baseAmount: toMoney(base),
    gstAmount: toMoney(gst),
    totalInclGst: toMoney(totalInclGst),
    grandTotal: toMoney(grandTotal),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Sale calculations
// ────────────────────────────────────────────────────────────────────────────

export interface SaleTotals {
  totalKg: number;
  baseAmount: number;
  gstAmount: number;
  totalInclGst: number;
}

/**
 * Compute derived totals for a sale row.
 * For sales, grand total = base + gst (transport is an expense, not billed to buyer).
 */
export function computeSaleTotals(row: {
  qtyBags: number;
  kgPerBag: number | string;
  ratePerKg: string;
  gstPct: string;
}): SaleTotals {
  const totalKg = row.qtyBags * Number(row.kgPerBag);
  const rate = D(row.ratePerKg);
  const base = rate.mul(totalKg);
  const gst = base.mul(D(row.gstPct)).div(100);
  const totalInclGst = base.plus(gst);

  return {
    totalKg,
    baseAmount: toMoney(base),
    gstAmount: toMoney(gst),
    totalInclGst: toMoney(totalInclGst),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Balance & status
// ────────────────────────────────────────────────────────────────────────────

export type TxnStatus = "Paid" | "Overpaid" | "Partial" | "Pending" | "Received";

/** Compute balance due for a purchase. */
export function computePurchaseBalance(
  grandTotal: number,
  amountPaid: string,
  linkedPayments: number
): { balanceDue: number; status: TxnStatus } {
  const bal = D(grandTotal).minus(D(amountPaid)).minus(D(linkedPayments));
  const balanceDue = toMoney(bal);
  const status: TxnStatus =
    bal.lt(0) ? "Overpaid" : bal.eq(0) ? "Paid" : bal.lt(D(grandTotal)) ? "Partial" : "Pending";
  return { balanceDue, status };
}

/** Compute balance receivable for a sale. */
export function computeSaleBalance(
  totalInclGst: number,
  amountReceived: string,
  linkedPayments: number
): { balanceReceivable: number; status: TxnStatus } {
  const bal = D(totalInclGst).minus(D(amountReceived)).minus(D(linkedPayments));
  const balanceReceivable = toMoney(bal);
  const status: TxnStatus =
    bal.lt(0) ? "Overpaid" : bal.eq(0) ? "Received" : bal.lt(D(totalInclGst)) ? "Partial" : "Pending";
  return { balanceReceivable, status };
}

// ────────────────────────────────────────────────────────────────────────────
// Broker commission
// ────────────────────────────────────────────────────────────────────────────

export function computeBrokerCommission(
  commissionType: string | null,
  commissionValue: string | null,
  qtyBags: number,
  baseAmount: number
): number {
  if (!commissionType || !commissionValue) return 0;
  const val = D(commissionValue);
  if (commissionType === "per_bag") {
    return toMoney(val.mul(qtyBags));
  }
  if (commissionType === "percentage") {
    return toMoney(D(baseAmount).mul(val).div(100));
  }
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Weighted average cost
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute weighted average cost per kg from aggregated purchase data.
 * @param totalBase SUM(qty * kgPerBag * ratePerKg) across purchases
 * @param totalKg SUM(qty * kgPerBag) across purchases
 */
export function computeAvgCostPerKg(totalBase: string, totalKg: string): number {
  const kg = D(totalKg);
  if (kg.lte(0)) return 0;
  return toMoney(D(totalBase).div(kg));
}

// ────────────────────────────────────────────────────────────────────────────
// CC interest (daily accrual)
// ────────────────────────────────────────────────────────────────────────────

export interface CcEntry {
  date: string;
  runningBalance: string;
}

/**
 * Calculate total accrued interest across CC entries using daily simple interest.
 * Formula per period: balance × days × annualRate / 365 / 100
 */
export function computeCcInterest(
  entries: CcEntry[],
  annualRate: number,
  endDate: Date = new Date()
): { perEntry: number[]; total: number } {
  const rate = D(annualRate);
  const perEntry: number[] = [];
  let total = new Decimal(0);

  for (let i = 0; i < entries.length; i++) {
    const thisDate = new Date(entries[i].date);
    const nextDate = i < entries.length - 1 ? new Date(entries[i + 1].date) : endDate;
    const days = Math.max(
      0,
      Math.floor((nextDate.getTime() - thisDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    const bal = D(entries[i].runningBalance);
    const interest = bal.mul(days).mul(rate).div(365).div(100);
    perEntry.push(toMoney(interest));
    total = total.plus(interest);
  }

  return { perEntry, total: toMoney(total) };
}

// ────────────────────────────────────────────────────────────────────────────
// Product full name
// ────────────────────────────────────────────────────────────────────────────

export function productFullName(product: {
  millBrand: string;
  fibreType: string;
  count: string;
  qualityGrade: string;
  colorShade?: string | null;
}): string {
  const base = `${product.millBrand} ${product.fibreType} ${product.count} ${product.qualityGrade}`;
  return product.colorShade ? `${base} ${product.colorShade}` : base;
}

// ────────────────────────────────────────────────────────────────────────────
// Zod refinements for monetary / date inputs
// ────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

/** Validates that a string is a non-negative decimal number (up to 2 decimal places). */
export const monetaryString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid amount (e.g., 1500.00)")
  .refine((s) => parseFloat(s) >= 0, "Amount must be non-negative");

/** Validates that a string is a non-negative decimal (percentage). */
export const percentageString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid percentage (e.g., 5.00)")
  .refine((s) => {
    const n = parseFloat(s);
    return n >= 0 && n <= 100;
  }, "Percentage must be between 0 and 100");

/** Validates ISO date format YYYY-MM-DD. */
export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date (YYYY-MM-DD)");
