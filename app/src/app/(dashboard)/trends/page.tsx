"use client";

import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { LOOKBACK_PRESETS, TrendsBucket, useTrendsView } from "@/lib/useTrendsView";

// Lazy-load recharts so it doesn't block the /trends shell from painting.
const TrendChart = dynamic(
  () => import("@/components/shared/trend-chart").then((m) => m.TrendChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-white rounded-2xl border border-gray-100 p-4 h-[280px] animate-pulse"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="h-4 w-32 bg-gray-100 rounded mb-3" />
        <div className="h-[220px] bg-gray-50 rounded" />
      </div>
    ),
  }
);

const BUCKETS: { value: TrendsBucket; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const BUCKET_UNIT: Record<TrendsBucket, string> = {
  day: "days",
  week: "weeks",
  month: "months",
};

export default function TrendsPage() {
  const { view, setBucket, setLookback } = useTrendsView();
  const { data, isLoading, isFetching } = trpc.trends.getSeries.useQuery(
    { bucket: view.bucket, lookback: view.lookback },
    { staleTime: 60_000 }
  );

  const subtitle = `Last ${view.lookback} ${BUCKET_UNIT[view.bucket]}`;
  const presets = LOOKBACK_PRESETS[view.bucket];

  return (
    <div className="animate-fade-in">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Trends</h1>
        <div className="sticky top-0 z-10 bg-[#F8F9FA] -mx-3 px-3 py-2 md:relative md:bg-transparent md:px-0 md:py-0 md:mx-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 border-b border-gray-100 md:border-0 mb-3">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 w-full md:w-auto">
            {BUCKETS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setBucket(b.value)}
                className={`flex-1 md:flex-initial min-h-[40px] px-4 text-sm font-semibold rounded-lg transition-colors ${
                  view.bucket === b.value
                    ? "bg-[#1B4F72] text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="whitespace-nowrap">Last</span>
            <select
              value={view.lookback}
              onChange={(e) => setLookback(Number(e.target.value))}
              className="min-h-[40px] px-3 py-1 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-800"
            >
              {presets.map((n) => (
                <option key={n} value={n}>
                  {n} {BUCKET_UNIT[view.bucket]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-gray-100 p-4 h-[280px] animate-pulse"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="h-4 w-32 bg-gray-100 rounded mb-3" />
              <div className="h-[220px] bg-gray-50 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isFetching ? "opacity-70" : ""}`}>
          <TrendChart
            title="Revenue"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.revenue}
            kind="bar"
            format="currency"
            emptyHint="No sales in this window."
          />
          <TrendChart
            title="Purchase value"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.purchaseValue}
            kind="bar"
            format="currency"
            emptyHint="No purchases in this window."
          />
          <TrendChart
            title="Gross margin"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.margin}
            kind="bar"
            format="currency"
            positiveNegative
            emptyHint="No sales to compute margin."
          />
          <TrendChart
            title="Gross margin %"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.marginPct}
            kind="line"
            format="percent"
            emptyHint="No sales to compute margin."
          />
          <TrendChart
            title="Bags purchased"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.bagsPurchased}
            kind="bar"
            format="bags"
            emptyHint="No purchases in this window."
          />
          <TrendChart
            title="Bags sold"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.bagsSold}
            kind="bar"
            format="bags"
            emptyHint="No sales in this window."
          />
          <TrendChart
            title="Payments received"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.paymentsReceived}
            kind="bar"
            format="currency"
            emptyHint="No collections in this window."
          />
          <TrendChart
            title="Payments paid"
            subtitle={subtitle}
            bucketLabels={data.bucketLabels}
            values={data.paymentsPaid}
            kind="bar"
            format="currency"
            emptyHint="No payments in this window."
          />
        </div>
      )}
    </div>
  );
}
