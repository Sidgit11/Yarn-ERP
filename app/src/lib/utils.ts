import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Warn if entered kg/bag deviates >10% from product's typical kg/bag.
// Returns null when no typical value (new product) or when within tolerance.
export function kgPerBagWarning(entered: number, typical: number | null | undefined): string | null {
  if (!typical || typical <= 0 || !entered || entered <= 0) return null;
  const deviation = Math.abs(entered - typical) / typical;
  if (deviation <= 0.1) return null;
  return `Heads up: this product is usually ${typical} kg/bag. You entered ${entered}. Double-check before saving.`;
}

// Warn if date is more than 2 years from today (past or future).
export function dateOutOfRangeWarning(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
  const diffMs = d.getTime() - now.getTime();
  if (Math.abs(diffMs) <= TWO_YEARS_MS) return null;
  const direction = diffMs < 0 ? "in the past" : "in the future";
  return `Date is more than 2 years ${direction}. Did you mistype the year?`;
}

// Format number in Indian numbering system (lakhs, crores)
export function formatIndianCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0";

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  // Split into integer and decimal parts
  const parts = absNum.toFixed(2).split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  // Indian grouping: last 3 digits, then groups of 2
  let result = "";
  if (intPart.length <= 3) {
    result = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const remaining = intPart.slice(0, -3);
    const groups = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    result = groups + "," + last3;
  }

  const formatted = result + "." + decPart;
  return (isNegative ? "-₹" : "₹") + formatted;
}

// Parse forgiving inputs like "10L", "5Cr", "1000000"
export function parseIndianAmount(input: string): number | null {
  const cleaned = input.trim().replace(/[₹,\s]/g, "");

  const lakhMatch = cleaned.match(/^(\d+\.?\d*)\s*[lL]$/);
  if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000;

  const croreMatch = cleaned.match(/^(\d+\.?\d*)\s*[cC][rR]?$/);
  if (croreMatch) return parseFloat(croreMatch[1]) * 10000000;

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Format date for display
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

