import { describe, it, expect } from "vitest";
import { formatIndianCurrency, parseIndianAmount, formatDate } from "../utils";

describe("formatIndianCurrency", () => {
  it("formats zero", () => {
    expect(formatIndianCurrency(0)).toBe("₹0.00");
  });

  it("formats thousands", () => {
    expect(formatIndianCurrency(5000)).toBe("₹5,000.00");
  });

  it("formats lakhs", () => {
    expect(formatIndianCurrency(500000)).toBe("₹5,00,000.00");
  });

  it("formats crores", () => {
    expect(formatIndianCurrency(10000000)).toBe("₹1,00,00,000.00");
  });

  it("formats typical purchase amount", () => {
    expect(formatIndianCurrency(1050000)).toBe("₹10,50,000.00");
  });

  it("handles negative amounts", () => {
    expect(formatIndianCurrency(-28000)).toBe("-₹28,000.00");
  });

  it("handles string input", () => {
    expect(formatIndianCurrency("1050000")).toBe("₹10,50,000.00");
  });

  it("handles decimal amounts", () => {
    expect(formatIndianCurrency(1050000.50)).toBe("₹10,50,000.50");
  });

  it("handles NaN input", () => {
    expect(formatIndianCurrency("abc")).toBe("₹0");
  });
});

describe("parseIndianAmount", () => {
  it("parses plain number", () => {
    expect(parseIndianAmount("500000")).toBe(500000);
  });

  it("parses lakhs with L suffix", () => {
    expect(parseIndianAmount("5L")).toBe(500000);
  });

  it("parses lakhs with lowercase l", () => {
    expect(parseIndianAmount("5l")).toBe(500000);
  });

  it("parses decimal lakhs", () => {
    expect(parseIndianAmount("10.5L")).toBe(1050000);
  });

  it("parses crores", () => {
    expect(parseIndianAmount("1Cr")).toBe(10000000);
  });

  it("parses with ₹ symbol and commas", () => {
    expect(parseIndianAmount("₹5,00,000")).toBe(500000);
  });

  it("returns null for invalid input", () => {
    expect(parseIndianAmount("abc")).toBeNull();
  });

  it("handles empty string", () => {
    expect(parseIndianAmount("")).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats date string", () => {
    const result = formatDate("2026-03-29");
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
  });
});
