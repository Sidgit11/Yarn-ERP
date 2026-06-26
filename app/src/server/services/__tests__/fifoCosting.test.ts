import { describe, it, expect } from "vitest";
import {
  computeSaleCosting,
  computeFifoInventoryValue,
  computeFifoAllocations,
} from "../fifoCosting";

// Helpers to build minimal rows. ratePerKg / kgPerBag arrive as strings from the DB.
function purchase(o: {
  id?: string;
  productId?: string;
  date: string;
  qtyBags: number;
  kgPerBag?: number | string;
  ratePerKg: number | string;
  createdAt?: string;
}) {
  return {
    id: o.id ?? o.date + "-p",
    productId: o.productId ?? "prod-1",
    date: o.date,
    qtyBags: o.qtyBags,
    kgPerBag: o.kgPerBag ?? 100,
    ratePerKg: o.ratePerKg,
    createdAt: o.createdAt ?? o.date,
  };
}
function sale(o: {
  id: string;
  productId?: string;
  date: string;
  qtyBags: number;
  createdAt?: string;
}) {
  return {
    id: o.id,
    productId: o.productId ?? "prod-1",
    date: o.date,
    qtyBags: o.qtyBags,
    createdAt: o.createdAt ?? o.date,
  };
}

describe("computeSaleCosting", () => {
  it("costs a single sale from a single layer", () => {
    // 100 bags @ kgPerBag 100, rate 150 => costPerBag = 15000
    const purchases = [purchase({ date: "2026-01-01", qtyBags: 100, ratePerKg: 150 })];
    const sales = [sale({ id: "s1", date: "2026-01-05", qtyBags: 30 })];

    const result = computeSaleCosting(purchases, sales);

    expect(result.get("s1")).toEqual({ cogs: 450000, costedBags: 30, uncostedBags: 0 });
  });

  it("costs the canonical 30/20/50 split across two price layers", () => {
    // 50 @ p1 (rate 150 => costPerBag 15000), then 50 @ p2 (rate 200 => costPerBag 20000)
    const purchases = [
      purchase({ id: "p1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }),
      purchase({ id: "p2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }),
    ];
    const sales = [
      sale({ id: "s1", date: "2026-01-10", qtyBags: 30 }),
      sale({ id: "s2", date: "2026-01-11", qtyBags: 20 }),
      sale({ id: "s3", date: "2026-01-12", qtyBags: 50 }),
    ];

    const result = computeSaleCosting(purchases, sales);

    expect(result.get("s1")).toEqual({ cogs: 450000, costedBags: 30, uncostedBags: 0 }); // 30@15000
    expect(result.get("s2")).toEqual({ cogs: 300000, costedBags: 20, uncostedBags: 0 }); // 20@15000
    expect(result.get("s3")).toEqual({ cogs: 1000000, costedBags: 50, uncostedBags: 0 }); // 50@20000
  });

  it("splits a single sale across two layers", () => {
    const purchases = [
      purchase({ id: "p1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }), // 15000/bag
      purchase({ id: "p2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }), // 20000/bag
    ];
    const sales = [sale({ id: "s1", date: "2026-01-10", qtyBags: 60 })];

    const result = computeSaleCosting(purchases, sales);

    // 50@15000 + 10@20000 = 750000 + 200000 = 950000
    expect(result.get("s1")).toEqual({ cogs: 950000, costedBags: 60, uncostedBags: 0 });
  });

  it("derives cost-per-bag per layer when kgPerBag varies", () => {
    const purchases = [
      purchase({ id: "p1", date: "2026-01-01", qtyBags: 10, kgPerBag: 50, ratePerKg: 100 }), // 5000/bag
      purchase({ id: "p2", date: "2026-01-02", qtyBags: 10, kgPerBag: 100, ratePerKg: 100 }), // 10000/bag
    ];
    const sales = [sale({ id: "s1", date: "2026-01-10", qtyBags: 15 })];

    const result = computeSaleCosting(purchases, sales);

    // 10@5000 + 5@10000 = 50000 + 50000 = 100000
    expect(result.get("s1")).toEqual({ cogs: 100000, costedBags: 15, uncostedBags: 0 });
  });

  it("flags excess bags as uncosted when sales exceed purchases", () => {
    const purchases = [purchase({ date: "2026-01-01", qtyBags: 50, ratePerKg: 150 })]; // 15000/bag
    const sales = [sale({ id: "s1", date: "2026-01-10", qtyBags: 80 })];

    const result = computeSaleCosting(purchases, sales);

    // 50 costed @15000 = 750000; 30 uncosted
    expect(result.get("s1")).toEqual({ cogs: 750000, costedBags: 50, uncostedBags: 30 });
  });

  it("treats all bags as uncosted when there are no purchases", () => {
    const result = computeSaleCosting([], [sale({ id: "s1", date: "2026-01-10", qtyBags: 20 })]);
    expect(result.get("s1")).toEqual({ cogs: 0, costedBags: 0, uncostedBags: 20 });
  });

  it("orders layers and sales by date regardless of array order", () => {
    // Later-dated cheaper layer must be consumed AFTER the earlier-dated dearer one.
    const purchases = [
      purchase({ id: "pB", date: "2026-02-01", qtyBags: 10, ratePerKg: 100 }), // 10000/bag
      purchase({ id: "pA", date: "2026-01-01", qtyBags: 10, ratePerKg: 200 }), // 20000/bag
    ];
    const sales = [sale({ id: "s1", date: "2026-03-01", qtyBags: 1 })];

    const result = computeSaleCosting(purchases, sales);

    // Oldest layer (Jan, 20000) consumed first
    expect(result.get("s1")).toEqual({ cogs: 20000, costedBags: 1, uncostedBags: 0 });
  });

  it("uses createdAt then id as tiebreak when dates are equal", () => {
    const purchases = [
      purchase({ id: "pLater", date: "2026-01-01", qtyBags: 5, ratePerKg: 200, createdAt: "2026-01-01T10:00:00Z" }), // 20000
      purchase({ id: "pEarlier", date: "2026-01-01", qtyBags: 5, ratePerKg: 100, createdAt: "2026-01-01T09:00:00Z" }), // 10000
    ];
    const sales = [sale({ id: "s1", date: "2026-01-02", qtyBags: 5 })];

    const result = computeSaleCosting(purchases, sales);

    // Earlier-created layer (10000) consumed first
    expect(result.get("s1")).toEqual({ cogs: 50000, costedBags: 5, uncostedBags: 0 });
  });

  it("keeps products independent", () => {
    const purchases = [
      purchase({ id: "px", productId: "X", date: "2026-01-01", qtyBags: 10, ratePerKg: 100 }), // 10000/bag
      purchase({ id: "py", productId: "Y", date: "2026-01-01", qtyBags: 10, ratePerKg: 300 }), // 30000/bag
    ];
    const sales = [
      sale({ id: "sx", productId: "X", date: "2026-01-10", qtyBags: 5 }),
      sale({ id: "sy", productId: "Y", date: "2026-01-10", qtyBags: 5 }),
    ];

    const result = computeSaleCosting(purchases, sales);

    expect(result.get("sx")).toEqual({ cogs: 50000, costedBags: 5, uncostedBags: 0 });
    expect(result.get("sy")).toEqual({ cogs: 150000, costedBags: 5, uncostedBags: 0 });
  });

  it("reconciles: sum of per-sale COGS equals total layer cost consumed", () => {
    const purchases = [
      purchase({ id: "p1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }), // 15000/bag -> 750000 total
      purchase({ id: "p2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }), // 20000/bag -> 1000000 total
    ];
    const sales = [
      sale({ id: "s1", date: "2026-01-10", qtyBags: 30 }),
      sale({ id: "s2", date: "2026-01-11", qtyBags: 20 }),
      sale({ id: "s3", date: "2026-01-12", qtyBags: 50 }),
    ];

    const result = computeSaleCosting(purchases, sales);
    const totalCogs = [...result.values()].reduce((a, r) => a + r.cogs, 0);

    // All 100 bags sold => full inventory cost consumed = 750000 + 1000000
    expect(totalCogs).toBe(1750000);
  });
});

describe("computeFifoInventoryValue", () => {
  it("values remaining stock from the un-consumed layers", () => {
    // 100 bags @ 15000/bag, 30 sold => 70 remaining
    const purchases = [purchase({ date: "2026-01-01", qtyBags: 100, ratePerKg: 150 })];
    const sales = [sale({ id: "s1", date: "2026-01-05", qtyBags: 30 })];

    const result = computeFifoInventoryValue(purchases, sales);

    expect(result.get("prod-1")).toEqual({ remainingBags: 70, remainingValue: 1050000 });
  });

  it("values remaining stock at the newest layers after FIFO consumption", () => {
    const purchases = [
      purchase({ id: "p1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }), // 15000/bag
      purchase({ id: "p2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }), // 20000/bag
    ];
    const sales = [sale({ id: "s1", date: "2026-01-10", qtyBags: 60 })];

    const result = computeFifoInventoryValue(purchases, sales);

    // layer1 fully consumed, layer2 has 40 bags left @ 20000
    expect(result.get("prod-1")).toEqual({ remainingBags: 40, remainingValue: 800000 });
  });

  it("reports zero remaining (never negative) when oversold", () => {
    const purchases = [purchase({ date: "2026-01-01", qtyBags: 50, ratePerKg: 150 })];
    const sales = [sale({ id: "s1", date: "2026-01-10", qtyBags: 80 })];

    const result = computeFifoInventoryValue(purchases, sales);

    expect(result.get("prod-1")).toEqual({ remainingBags: 0, remainingValue: 0 });
  });

  it("values full stock for a product with purchases but no sales", () => {
    const purchases = [purchase({ date: "2026-01-01", qtyBags: 10, ratePerKg: 100 })]; // 10000/bag
    const result = computeFifoInventoryValue(purchases, []);
    expect(result.get("prod-1")).toEqual({ remainingBags: 10, remainingValue: 100000 });
  });

  it("reconciles: purchase base = FIFO COGS + remaining inventory value", () => {
    const purchases = [
      purchase({ id: "p1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }), // base 750000
      purchase({ id: "p2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }), // base 1000000
    ];
    const sales = [sale({ id: "s1", date: "2026-01-10", qtyBags: 70 })];

    const costing = computeSaleCosting(purchases, sales);
    const inventory = computeFifoInventoryValue(purchases, sales);

    const cogs = costing.get("s1")!.cogs;
    const remaining = inventory.get("prod-1")!.remainingValue;

    // 50@15000 + 20@20000 = 1150000 COGS; 30@20000 = 600000 remaining; total 1750000 base
    expect(cogs).toBe(1150000);
    expect(remaining).toBe(600000);
    expect(cogs + remaining).toBe(1750000);
  });
});

// Allocation rows carry display ids + buyer so the draw matrix can name lots/customers.
function aPurchase(o: {
  id: string;
  displayId: string;
  productId?: string;
  date: string;
  qtyBags: number;
  kgPerBag?: number | string;
  ratePerKg: number | string;
  createdAt?: string;
}) {
  return {
    id: o.id,
    displayId: o.displayId,
    productId: o.productId ?? "prod-1",
    date: o.date,
    qtyBags: o.qtyBags,
    kgPerBag: o.kgPerBag ?? 100,
    ratePerKg: o.ratePerKg,
    createdAt: o.createdAt ?? o.date,
  };
}
function aSale(o: {
  id: string;
  displayId: string;
  buyerId: string;
  productId?: string;
  date: string;
  qtyBags: number;
  createdAt?: string;
}) {
  return {
    id: o.id,
    displayId: o.displayId,
    buyerId: o.buyerId,
    productId: o.productId ?? "prod-1",
    date: o.date,
    qtyBags: o.qtyBags,
    createdAt: o.createdAt ?? o.date,
  };
}

describe("computeFifoAllocations", () => {
  it("produces a draw per sale↔lot pairing for the 30/20/50 split", () => {
    const purchases = [
      aPurchase({ id: "p1", displayId: "P1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }), // 15000/bag
      aPurchase({ id: "p2", displayId: "P2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }), // 20000/bag
    ];
    const sales = [
      aSale({ id: "s1", displayId: "S1", buyerId: "B1", date: "2026-01-10", qtyBags: 30 }),
      aSale({ id: "s2", displayId: "S2", buyerId: "B2", date: "2026-01-11", qtyBags: 20 }),
      aSale({ id: "s3", displayId: "S3", buyerId: "B3", date: "2026-01-12", qtyBags: 50 }),
    ];

    const { draws } = computeFifoAllocations(purchases, sales);

    expect(draws).toEqual([
      { saleId: "s1", saleDisplayId: "S1", buyerId: "B1", purchaseId: "p1", purchaseDisplayId: "P1", bags: 30, costPerBag: 15000, ratePerKg: 150, purchaseDate: "2026-01-01" },
      { saleId: "s2", saleDisplayId: "S2", buyerId: "B2", purchaseId: "p1", purchaseDisplayId: "P1", bags: 20, costPerBag: 15000, ratePerKg: 150, purchaseDate: "2026-01-01" },
      { saleId: "s3", saleDisplayId: "S3", buyerId: "B3", purchaseId: "p2", purchaseDisplayId: "P2", bags: 50, costPerBag: 20000, ratePerKg: 200, purchaseDate: "2026-01-02" },
    ]);
  });

  it("splits one sale across two lots into two draws", () => {
    const purchases = [
      aPurchase({ id: "p1", displayId: "P1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }),
      aPurchase({ id: "p2", displayId: "P2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }),
    ];
    const sales = [aSale({ id: "s1", displayId: "S1", buyerId: "B1", date: "2026-01-10", qtyBags: 60 })];

    const { draws } = computeFifoAllocations(purchases, sales);

    expect(draws.map((d) => [d.purchaseDisplayId, d.bags])).toEqual([
      ["P1", 50],
      ["P2", 10],
    ]);
  });

  it("reports remaining bags per lot", () => {
    const purchases = [
      aPurchase({ id: "p1", displayId: "P1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }),
      aPurchase({ id: "p2", displayId: "P2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }),
    ];
    const sales = [aSale({ id: "s1", displayId: "S1", buyerId: "B1", date: "2026-01-10", qtyBags: 60 })];

    const { remainingByLot } = computeFifoAllocations(purchases, sales);

    expect(remainingByLot.get("P1")).toBe(0);
    expect(remainingByLot.get("P2")).toBe(40);
  });

  it("records oversold bags as uncosted, not a phantom draw", () => {
    const purchases = [
      aPurchase({ id: "p1", displayId: "P1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }),
    ];
    const sales = [aSale({ id: "s1", displayId: "S1", buyerId: "B1", date: "2026-01-10", qtyBags: 80 })];

    const { draws, uncostedBySale } = computeFifoAllocations(purchases, sales);

    expect(draws).toEqual([
      { saleId: "s1", saleDisplayId: "S1", buyerId: "B1", purchaseId: "p1", purchaseDisplayId: "P1", bags: 50, costPerBag: 15000, ratePerKg: 150, purchaseDate: "2026-01-01" },
    ]);
    expect(uncostedBySale.get("s1")).toBe(30);
  });

  it("keeps products isolated", () => {
    const purchases = [
      aPurchase({ id: "px", displayId: "PX", productId: "X", date: "2026-01-01", qtyBags: 10, ratePerKg: 100 }),
      aPurchase({ id: "py", displayId: "PY", productId: "Y", date: "2026-01-01", qtyBags: 10, ratePerKg: 300 }),
    ];
    const sales = [
      aSale({ id: "sx", displayId: "SX", buyerId: "BX", productId: "X", date: "2026-01-10", qtyBags: 5 }),
      aSale({ id: "sy", displayId: "SY", buyerId: "BY", productId: "Y", date: "2026-01-10", qtyBags: 5 }),
    ];

    const { draws } = computeFifoAllocations(purchases, sales);
    const sx = draws.filter((d) => d.saleId === "sx");
    const sy = draws.filter((d) => d.saleId === "sy");

    expect(sx).toHaveLength(1);
    expect(sx[0].purchaseDisplayId).toBe("PX");
    expect(sy[0].purchaseDisplayId).toBe("PY");
  });

  it("reconciles: each sale's draws sum to its COGS from computeSaleCosting", () => {
    const purchases = [
      aPurchase({ id: "p1", displayId: "P1", date: "2026-01-01", qtyBags: 50, ratePerKg: 150 }),
      aPurchase({ id: "p2", displayId: "P2", date: "2026-01-02", qtyBags: 50, ratePerKg: 200 }),
    ];
    const sales = [
      aSale({ id: "s1", displayId: "S1", buyerId: "B1", date: "2026-01-10", qtyBags: 30 }),
      aSale({ id: "s2", displayId: "S2", buyerId: "B2", date: "2026-01-11", qtyBags: 40 }),
    ];

    const { draws } = computeFifoAllocations(purchases, sales);
    const costing = computeSaleCosting(purchases, sales);

    for (const saleId of ["s1", "s2"]) {
      const drawSum = draws
        .filter((d) => d.saleId === saleId)
        .reduce((acc, d) => acc + d.bags * d.costPerBag, 0);
      expect(drawSum).toBe(costing.get(saleId)!.cogs);
    }
  });
});
