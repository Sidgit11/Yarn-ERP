import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

