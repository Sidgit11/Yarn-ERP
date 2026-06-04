import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { purchases, sales, payments } from "../../db/schema";
import { and, eq, isNull, gte, lte, sql } from "drizzle-orm";
import { D, toMoney } from "../../services/calculations";

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

      // PG date_trunc on a `date` column returns a timestamp; we cast back
      // to date so it groups cleanly and the wire stays string-typed.
      const truncSql = (col: any) =>
        sql<string>`date_trunc(${bucket}, ${col})::date`;

      // Run the 3 aggregations + the global avg-cost lookup in parallel.
      const [purchaseRows, saleRows, paymentRows, avgCostRow] = await Promise.all([
        ctx.db
          .select({
            bucket: truncSql(purchases.date),
            baseAmount: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag} * ${purchases.ratePerKg}::numeric), 0)`,
            qtyBags: sql<string>`COALESCE(SUM(${purchases.qtyBags}), 0)`,
          })
          .from(purchases)
          .where(
            and(
              eq(purchases.tenantId, tid),
              isNull(purchases.deletedAt),
              gte(purchases.date, fromIso),
              lte(purchases.date, toIso)
            )
          )
          .groupBy(truncSql(purchases.date)),
        ctx.db
          .select({
            bucket: truncSql(sales.date),
            baseAmount: sql<string>`COALESCE(SUM(${sales.qtyBags} * ${sales.kgPerBag} * ${sales.ratePerKg}::numeric), 0)`,
            totalKg: sql<string>`COALESCE(SUM(${sales.qtyBags} * ${sales.kgPerBag}), 0)`,
            transport: sql<string>`COALESCE(SUM(${sales.transport}::numeric), 0)`,
            qtyBags: sql<string>`COALESCE(SUM(${sales.qtyBags}), 0)`,
          })
          .from(sales)
          .where(
            and(
              eq(sales.tenantId, tid),
              isNull(sales.deletedAt),
              gte(sales.date, fromIso),
              lte(sales.date, toIso)
            )
          )
          .groupBy(truncSql(sales.date)),
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
          .groupBy(truncSql(payments.date), payments.direction),
        // Global weighted avg cost per kg (all-time). Used so bucket-margin
        // doesn't get skewed by buckets that happen to have few purchases.
        ctx.db
          .select({
            totalBase: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag} * ${purchases.ratePerKg}::numeric), 0)`,
            totalKg: sql<string>`COALESCE(SUM(${purchases.qtyBags} * ${purchases.kgPerBag}), 0)`,
          })
          .from(purchases)
          .where(and(eq(purchases.tenantId, tid), isNull(purchases.deletedAt))),
      ]);

      const totalKgGlobal = D(avgCostRow[0]?.totalKg ?? "0");
      const avgCostPerKg = totalKgGlobal.gt(0)
        ? D(avgCostRow[0]?.totalBase ?? "0").div(totalKgGlobal)
        : D(0);

      // Index aggregations by bucket-start string.
      const purchaseByBucket = new Map(
        purchaseRows.map((r) => [normalizeBucket(r.bucket), r])
      );
      const saleByBucket = new Map(
        saleRows.map((r) => [normalizeBucket(r.bucket), r])
      );
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
      const paymentsReceived: number[] = [];
      const paymentsPaid: number[] = [];

      for (const b of buckets) {
        const p = purchaseByBucket.get(b);
        const s = saleByBucket.get(b);
        const pay = paymentByBucketDir.get(b);

        const purchaseAmt = D(p?.baseAmount ?? "0");
        const saleAmt = D(s?.baseAmount ?? "0");
        const saleKg = D(s?.totalKg ?? "0");
        const saleTransport = D(s?.transport ?? "0");

        const cogs = avgCostPerKg.mul(saleKg);
        const grossMargin = saleAmt.minus(cogs).minus(saleTransport);
        const pct = saleAmt.gt(0) ? grossMargin.div(saleAmt).mul(100) : null;

        revenue.push(toMoney(saleAmt));
        purchaseValue.push(toMoney(purchaseAmt));
        margin.push(toMoney(grossMargin));
        marginPct.push(pct === null ? null : toMoney(pct));
        bagsPurchased.push(Number(p?.qtyBags ?? 0));
        bagsSold.push(Number(s?.qtyBags ?? 0));
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
