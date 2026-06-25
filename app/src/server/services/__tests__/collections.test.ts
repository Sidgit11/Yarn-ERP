import { describe, it, expect } from "vitest";
import { allocateCollection, capBatchToBalances } from "../collections";

// allocateCollection(bills, amount): bills are pre-sorted oldest-first; the amount
// fills each bill up to its balance, oldest first; the last touched bill may be
// partial; any excess beyond total outstanding is ignored (capped).

describe("allocateCollection", () => {
  it("fully settles a single bill when the amount matches its balance", () => {
    expect(allocateCollection([{ displayId: "S1", balance: 1000 }], 1000)).toEqual([
      { displayId: "S1", amount: 1000 },
    ]);
  });

  it("settles a partial amount against the first bill", () => {
    expect(allocateCollection([{ displayId: "S1", balance: 1000 }], 400)).toEqual([
      { displayId: "S1", amount: 400 },
    ]);
  });

  it("spreads a lump sum across bills oldest-first, last bill partial", () => {
    const bills = [
      { displayId: "S1", balance: 1000 },
      { displayId: "S2", balance: 2000 },
    ];
    expect(allocateCollection(bills, 2500)).toEqual([
      { displayId: "S1", amount: 1000 },
      { displayId: "S2", amount: 1500 },
    ]);
  });

  it("only touches as many bills as the amount reaches", () => {
    const bills = [
      { displayId: "S1", balance: 1000 },
      { displayId: "S2", balance: 2000 },
      { displayId: "S3", balance: 500 },
    ];
    expect(allocateCollection(bills, 1000)).toEqual([{ displayId: "S1", amount: 1000 }]);
  });

  it("settles every bill fully when the amount covers the total", () => {
    const bills = [
      { displayId: "S1", balance: 1000 },
      { displayId: "S2", balance: 2000 },
    ];
    expect(allocateCollection(bills, 3000)).toEqual([
      { displayId: "S1", amount: 1000 },
      { displayId: "S2", amount: 2000 },
    ]);
  });

  it("caps at total outstanding when the amount overpays", () => {
    expect(allocateCollection([{ displayId: "S1", balance: 1000 }], 1500)).toEqual([
      { displayId: "S1", amount: 1000 },
    ]);
  });

  it("returns nothing for a zero amount", () => {
    expect(allocateCollection([{ displayId: "S1", balance: 1000 }], 0)).toEqual([]);
  });

  it("returns nothing when there are no open bills", () => {
    expect(allocateCollection([], 5000)).toEqual([]);
  });

  it("handles decimal balances without floating-point drift", () => {
    const bills = [
      { displayId: "S1", balance: 33.33 },
      { displayId: "S2", balance: 33.33 },
    ];
    expect(allocateCollection(bills, 50)).toEqual([
      { displayId: "S1", amount: 33.33 },
      { displayId: "S2", amount: 16.67 },
    ]);
  });
});

// Server-side re-validation: cap each requested allocation against the bill's
// CURRENT balance (which may have changed since the screen loaded), skip
// missing/settled bills, and account for duplicates within the same batch.

describe("capBatchToBalances", () => {
  it("records items that are within their current balance", () => {
    const result = capBatchToBalances(
      [{ displayId: "S1", amount: 1000 }],
      [{ displayId: "S1", balance: 1000 }]
    );
    expect(result.toRecord).toEqual([{ displayId: "S1", amount: 1000 }]);
    expect(result.skipped).toEqual([]);
  });

  it("caps an item that exceeds the current balance", () => {
    const result = capBatchToBalances(
      [{ displayId: "S1", amount: 1500 }],
      [{ displayId: "S1", balance: 1000 }]
    );
    expect(result.toRecord).toEqual([{ displayId: "S1", amount: 1000 }]);
    expect(result.skipped).toEqual([]);
  });

  it("skips a bill that no longer exists", () => {
    const result = capBatchToBalances(
      [{ displayId: "S9", amount: 500 }],
      [{ displayId: "S1", balance: 1000 }]
    );
    expect(result.toRecord).toEqual([]);
    expect(result.skipped).toEqual([{ displayId: "S9", reason: "not_found" }]);
  });

  it("skips a bill that was already settled since the screen loaded", () => {
    const result = capBatchToBalances(
      [{ displayId: "S1", amount: 500 }],
      [{ displayId: "S1", balance: 0 }]
    );
    expect(result.toRecord).toEqual([]);
    expect(result.skipped).toEqual([{ displayId: "S1", reason: "settled" }]);
  });

  it("accounts for duplicate bills within one batch", () => {
    const result = capBatchToBalances(
      [
        { displayId: "S1", amount: 700 },
        { displayId: "S1", amount: 700 },
      ],
      [{ displayId: "S1", balance: 1000 }]
    );
    // First takes 700; second is capped to the remaining 300.
    expect(result.toRecord).toEqual([
      { displayId: "S1", amount: 700 },
      { displayId: "S1", amount: 300 },
    ]);
    expect(result.skipped).toEqual([]);
  });
});
