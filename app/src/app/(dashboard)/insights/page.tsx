"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate } from "@/lib/utils";
import { DateRangePicker, ActiveRangeBanner } from "@/components/shared/date-range-picker";
import { useDateRange } from "@/lib/useDateRange";

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------
function Section({
  title,
  count,
  accentColor = "red",
  children,
  emptyMessage,
}: {
  title: string;
  count: number;
  accentColor?: "red" | "amber" | "blue";
  children: React.ReactNode;
  emptyMessage: string;
}) {
  // Open by default when there are items; closed when empty
  const [open, setOpen] = useState(count > 0);

  const badgeClass =
    accentColor === "red"
      ? "bg-[#FADBD8] text-[#922B21] border-[#E74C3C]"
      : accentColor === "amber"
        ? "bg-[#FEF9E7] text-[#B7950B] border-[#F1C40F]"
        : "bg-[#EBF5FB] text-[#1B4F72] border-[#AED6F1]";

  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200">
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[#2C3E50]">{title}</h2>
          {count > 0 && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}
            >
              {count}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[#6C757D] shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#6C757D] shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4">
          {count === 0 ? (
            <p className="text-sm text-[#1E8449] py-1">{emptyMessage}</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page skeleton shown while loading
// ---------------------------------------------------------------------------
function InsightsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 animate-pulse"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="h-4 w-4 bg-gray-200 rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function InsightsPage() {
  const { serverInput } = useDateRange();
  const { data, isLoading } = trpc.insights.getAll.useQuery(serverInput ?? {});

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Insights</h1>
        <DateRangePicker />
      </div>
      <ActiveRangeBanner />

      {/* Floor summary line */}
      {!isLoading && data && (
        <div className="mb-4 px-3 py-2 bg-[#EBF5FB] border border-[#AED6F1] rounded-xl text-sm text-[#1B4F72]">
          Healthy margin floor:{" "}
          <span className="font-semibold">
            {(data.globalOverride ?? data.autoFloorPct).toFixed(1)}%
          </span>{" "}
          {data.globalOverride == null
            ? `(auto from your ${data.businessAvgPct.toFixed(1)}% average)`
            : "(your setting)"}{" "}
          &mdash;{" "}
          <Link href="/settings" className="underline hover:text-[#154360]">
            change in Settings
          </Link>
          .
        </div>
      )}

      {/* Loading */}
      {isLoading && <InsightsSkeleton />}

      {/* Sections */}
      {!isLoading && data && (
        <div className="space-y-3">
          {/* ── 1. Underpriced Sales ── */}
          <Section
            title="Underpriced Sales"
            count={data.underpriced.length}
            accentColor="red"
            emptyMessage="Nothing underpriced this period — nicely done."
          >
            <div className="space-y-3">
              {data.underpriced.map((row) => (
                <Link
                  key={row.saleId}
                  href="/sales"
                  className="block bg-[#F8F9FA] rounded-xl p-3 hover:bg-[#FDEDEC] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#ADB5BD]">
                        {row.displayId}
                      </span>
                      <span className="text-sm font-semibold text-[#2C3E50]">
                        {row.buyerName}
                      </span>
                    </div>
                    <span className="text-xs text-[#6C757D]">
                      {formatDate(row.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm mb-1.5">
                    <span className="font-semibold text-[#E74C3C]">
                      {row.marginPct.toFixed(1)}%
                    </span>
                    <span className="text-[#ADB5BD]">vs floor</span>
                    <span className="text-[#6C757D]">
                      {row.floorPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between flex-wrap gap-1">
                    <span className="text-[22px] font-bold text-[#E74C3C] leading-tight">
                      {formatIndianCurrency(row.moneyLeftOnTable)}
                    </span>
                    <span className="text-xs text-[#6C757D]">left on table</span>
                  </div>
                  <div className="text-xs text-[#6C757D] mt-1">
                    should&apos;ve charged ≥ ₹{row.minRatePerKg.toFixed(2)}/kg
                  </div>
                </Link>
              ))}
            </div>
          </Section>

          {/* ── 2. Buyer Squeeze ── */}
          <Section
            title="Buyer Squeeze"
            count={data.buyers.length}
            accentColor="amber"
            emptyMessage="No buyer is dragging your margin down right now."
          >
            <div className="space-y-3">
              {data.buyers.map((row) => (
                <Link
                  key={row.buyerId}
                  href="/contacts"
                  className="block bg-[#F8F9FA] rounded-xl p-3 hover:bg-[#FEF9E7] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      {row.buyerName}
                    </span>
                    <span className="text-xs text-[#6C757D]">
                      {row.saleCount} sales
                    </span>
                  </div>
                  <div className="text-sm text-[#6C757D] mb-1.5">
                    you earn{" "}
                    <span className="font-semibold text-[#B7950B]">
                      {row.weightedMarginPct.toFixed(1)}%
                    </span>{" "}
                    vs{" "}
                    <span className="font-semibold text-[#2C3E50]">
                      {data.businessAvgPct.toFixed(1)}%
                    </span>{" "}
                    overall
                  </div>
                  <div className="flex items-baseline justify-between flex-wrap gap-1">
                    <span className="text-[22px] font-bold text-[#B7950B] leading-tight">
                      {formatIndianCurrency(row.moneyAtStake)}
                    </span>
                    <span className="text-xs text-[#6C757D]">at stake</span>
                  </div>
                </Link>
              ))}
            </div>
          </Section>

          {/* ── 3. Aging Stock ── */}
          <Section
            title="Aging Stock"
            count={data.aging.length}
            accentColor="amber"
            emptyMessage="No stock sitting too long."
          >
            <div className="space-y-3">
              {data.aging.map((row) => (
                <Link
                  key={`${row.purchaseId}`}
                  href="/products"
                  className="block bg-[#F8F9FA] rounded-xl p-3 hover:bg-[#FEF9E7] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      {row.productName}
                    </span>
                    <span className="font-mono text-[11px] text-[#ADB5BD]">
                      {row.purchaseDisplayId}
                    </span>
                  </div>
                  <div className="text-sm text-[#6C757D] mb-1.5">
                    {row.remainingBags} bags &middot; {row.ageDays} days old
                  </div>
                  <div className="flex items-baseline justify-between flex-wrap gap-1">
                    <span className="text-[22px] font-bold text-[#B7950B] leading-tight">
                      {formatIndianCurrency(row.capitalTied)}
                    </span>
                    <span className="text-xs text-[#6C757D]">tied up</span>
                  </div>
                </Link>
              ))}
            </div>
          </Section>

          {/* ── 4. Margin Trend ── */}
          <Section
            title="Margin Trends"
            count={data.trends.length}
            accentColor="red"
            emptyMessage="Margins are holding steady."
          >
            <div className="space-y-3">
              {data.trends.map((row) => (
                <Link
                  key={row.productId}
                  href="/products"
                  className="block bg-[#F8F9FA] rounded-xl p-3 hover:bg-[#FDEDEC] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-[#2C3E50]">
                      {row.productName}
                    </span>
                    <span className="text-xs text-[#922B21] font-semibold">
                      &minus;{row.dropPp.toFixed(1)}pp
                    </span>
                  </div>
                  <div className="text-sm text-[#6C757D] mb-2">
                    <span className="text-[#2C3E50] font-medium">
                      {row.baselineMarginPct.toFixed(1)}%
                    </span>
                    {" → "}
                    <span className="font-semibold text-[#E74C3C]">
                      {row.recentMarginPct.toFixed(1)}%
                    </span>
                    {" "}
                    <span className="text-[#922B21]">
                      ({row.dropPp.toFixed(1)}pp drop)
                    </span>
                  </div>
                  {row.months.length > 0 && (
                    <div className="flex items-end gap-1.5 flex-wrap mt-1">
                      {row.months.map((m) => (
                        <div
                          key={m.month}
                          className="flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[10px] font-semibold text-[#2C3E50]">
                            {m.marginPct.toFixed(1)}%
                          </span>
                          <div
                            className="w-6 rounded-sm bg-[#AED6F1]"
                            style={{
                              height: `${Math.max(6, Math.round(m.marginPct * 3))}px`,
                            }}
                          />
                          <span className="text-[9px] text-[#ADB5BD] leading-tight">
                            {m.month.slice(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
