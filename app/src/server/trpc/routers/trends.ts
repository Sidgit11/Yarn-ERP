import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { purchases, sales, payments } from "../../db/schema";
import { and, eq, isNull, gte, lte, sql } from "drizzle-orm";
import { D, toMoney } from "../../services/calculations";
import { computeSaleCosting } from "../../services/fifoCosting";
import type Decimal from "decimal.js";

// Trends page: bucketed time-series for the dashboard's key metrics.
// One procedure powers all 8 charts.

const bucketEnum = z.enum(["day", "week", "month"]);

export const trendsRouter = router({
  getSeries: protectedProcedure
    .input(
      z.object({
        bucket: bucketEnum,
        lookback: z.number().int().min(1).max(180),
      })
    )
    .query(async ({ ctx, input }) => {
      const tid = ctx.tenantId;
      const { bucket, lookback } = input;

      // Compute window: [from = start-of-bucket(today − (lookback − 1)), to = today].
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const buckets = buildBucketStarts(today, bucket, lookback);
      const fromIso = buckets[0];
      const toIso = isoDate(today);

      // Inline bucket as a raw SQL literal (safe: validated by z.enum above).
      // Parameterising it caused drizzle to emit different parameter slots for
      // SELECT ($1) and GROUP BY ($5), so Postgres saw them as non-matching
      // expressions and the GROUP BY rejected the query.
      const bucketLit = sql.raw(`'${bucket}'`);
      const truncSql = (col: any) =>
        sql<string>`date_trunc(${bucketLit}, ${col}::timestamp)::date`;

      // Use GROUP BY 1, 2 (ordinals) — referring to SELECT columns sidesteps
      // drizzle inconsistently qualifying the column ref for grouping.
      const ord1and2 = sql.raw("1, 2");

      // FIFO margin needs each sale's COGS, which depends on the whole product
      // history — so we load all-time purchases + sales (raw) and bucket them in
      // JS. Payments have no FIFO dependency, so they stay a windowed aggregate.
      const [allPurchases, allSales, paymentRows] = await Promise.all([
        ctx.db
          .select({
            id: purchases.id,
            productId: purchases.productId,
            date: purchases.date,
            qtyBags: purchases.qtyBags,
            kgPerBag: purchases.kgPerBag,
            ratePerKg: purchases.ratePerKg,
            createdAt: purchases.createdAt,
          })
          .from(purchases)
          .where(and(eq(purchases.tenantId, tid), isNull(purchases.deletedAt))),
        ctx.db
          .select({
            id: sales.id,
            productId: sales.productId,
            date: sales.date,
            qtyBags: sales.qtyBags,
            kgPerBag: sales.kgPerBag,
            ratePerKg: sales.ratePerKg,
            transport: sales.transport,
            createdAt: sales.createdAt,
          })
          .from(sales)
          .where(and(eq(sales.tenantId, tid), isNull(sales.deletedAt))),
        ctx.db
          .select({
            bucket: truncSql(payments.date),
            direction: payments.direction,
            amount: sql<string>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, tid),
              isNull(payments.deletedAt),
              gte(payments.date, fromIso),
              lte(payments.date, toIso)
            )
          )
          .groupBy(ord1and2),
      ]);

      const fifoCosting = computeSaleCosting(allPurchases, allSales);

      // Bucket purchases (windowed) in JS.
      const purchaseByBucket = new Map<string, { baseAmount: Decimal; qtyBags: number }>();
      for (const p of allPurchases) {
        if (p.date < fromIso || p.date > toIso) continue;
        const key = bucketStartOf(p.date, bucket);
        const cur = purchaseByBucket.get(key) ?? { baseAmount: D(0), qtyBags: 0 };
        cur.baseAmount = cur.baseAmount.plus(D(p.qtyBags).mul(D(p.kgPerBag)).mul(D(p.ratePerKg)));
        cur.qtyBags += p.qtyBags;
        purchaseByBucket.set(key, cur);
      }

      // Bucket sales (windowed) in JS, attributing each sale's FIFO COGS.
      const saleByBucket = new Map<
        string,
        { baseAmount: Decimal; cogs: Decimal; transport: Decimal; qtyBags: number; uncostedBags: number }
      >();
      for (const s of allSales) {
        if (s.date < fromIso || s.date > toIso) continue;
        const key = bucketStartOf(s.date, bucket);
        const cur =
          saleByBucket.get(key) ??
          { baseAmount: D(0), cogs: D(0), transport: D(0), qtyBags: 0, uncostedBags: 0 };
        const c = fifoCosting.get(s.id);
        cur.baseAmount = cur.baseAmount.plus(D(s.qtyBags).mul(D(s.kgPerBag)).mul(D(s.ratePerKg)));
        cur.cogs = cur.cogs.plus(c?.cogs ?? 0);
        cur.transport = cur.transport.plus(D(s.transport));
        cur.qtyBags += s.qtyBags;
        cur.uncostedBags += c?.uncostedBags ?? 0;
        saleByBucket.set(key, cur);
      }

      const paymentByBucketDir = new Map<string, { received: string; paid: string }>();
      for (const r of paymentRows) {
        const key = normalizeBucket(r.bucket);
        const cur = paymentByBucketDir.get(key) ?? { received: "0", paid: "0" };
        if (r.direction === "Received") cur.received = r.amount;
        if (r.direction === "Paid") cur.paid = r.amount;
        paymentByBucketDir.set(key, cur);
      }

      // Assemble the continuous arrays.
      const revenue: number[] = [];
      const purchaseValue: number[] = [];
      const margin: number[] = [];
      const marginPct: (number | null)[] = [];
      const bagsPurchased: number[] = [];
      const bagsSold: number[] = [];
      const uncostedBags: number[] = [];
      const paymentsReceived: number[] = [];
      const paymentsPaid: number[] = [];

      for (const b of buckets) {
        const p = purchaseByBucket.get(b);
        const s = saleByBucket.get(b);
        const pay = paymentByBucketDir.get(b);

        const purchaseAmt = p?.baseAmount ?? D(0);
        const saleAmt = s?.baseAmount ?? D(0);
        const cogs = s?.cogs ?? D(0);
        const saleTransport = s?.transport ?? D(0);

        const grossMargin = saleAmt.minus(cogs).minus(saleTransport);
        const pct = saleAmt.gt(0) ? grossMargin.div(saleAmt).mul(100) : null;

        revenue.push(toMoney(saleAmt));
        purchaseValue.push(toMoney(purchaseAmt));
        margin.push(toMoney(grossMargin));
        marginPct.push(pct === null ? null : toMoney(pct));
        bagsPurchased.push(p?.qtyBags ?? 0);
        bagsSold.push(s?.qtyBags ?? 0);
        uncostedBags.push(s?.uncostedBags ?? 0);
        paymentsReceived.push(toMoney(D(pay?.received ?? "0")));
        paymentsPaid.push(toMoney(D(pay?.paid ?? "0")));
      }

      return {
        buckets,
        bucketLabels: buckets.map((b) => labelBucket(b, bucket)),
        bucket,
        revenue,
        purchaseValue,
        margin,
        marginPct,
        bagsPurchased,
        bagsSold,
        uncostedBags,
        paymentsReceived,
        paymentsPaid,
      };
    }),
});

// ── helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Build the ordered list of bucket-start ISO dates ending today (inclusive).
function buildBucketStarts(today: Date, bucket: "day" | "week" | "month", count: number): string[] {
  const out: string[] = [];
  if (bucket === "day") {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push(isoDate(d));
    }
  } else if (bucket === "week") {
    // ISO week starts Monday. Find current week's Monday.
    const dow = today.getDay(); // 0=Sun..6=Sat
    const offsetToMonday = dow === 0 ? 6 : dow - 1;
    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() - offsetToMonday);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(thisWeekMonday);
      d.setDate(thisWeekMonday.getDate() - 7 * i);
      out.push(isoDate(d));
    }
  } else {
    // month: 1st of each month
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(thisMonth);
      d.setMonth(thisMonth.getMonth() - i);
      out.push(isoDate(d));
    }
  }
  return out;
}

// Map a single ISO date to its bucket-start ISO date. Mirrors buildBucketStarts
// and Postgres date_trunc (week starts Monday) so JS-bucketed rows line up with
// the continuous bucket axis.
function bucketStartOf(iso: string, bucket: "day" | "week" | "month"): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (bucket === "day") return isoDate(date);
  if (bucket === "week") {
    const dow = date.getDay(); // 0=Sun..6=Sat
    const offsetToMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(date);
    monday.setDate(date.getDate() - offsetToMonday);
    return isoDate(monday);
  }
  return isoDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

// PG returns date as ISO string or Date object depending on driver — normalize.
function normalizeBucket(raw: unknown): string {
  if (raw instanceof Date) return isoDate(raw);
  if (typeof raw === "string") return raw.slice(0, 10);
  return String(raw);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelBucket(iso: string, bucket: "day" | "week" | "month"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const month = MONTHS[Number(m[2]) - 1];
  const day = Number(m[3]);
  if (bucket === "month") return `${month} ${year}`;
  if (bucket === "week") return `Wk ${day} ${month}`;
  return `${day} ${month}`;
}
