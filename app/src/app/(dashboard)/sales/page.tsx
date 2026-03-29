"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate } from "@/lib/utils";

export default function SalesPage() {
  const { data: salesList, isLoading } = trpc.sales.list.useQuery();

  const statusBadge = (status: string) => {
    const config =
      status === "Received"
        ? { bg: "bg-[#D5F5E3]", text: "text-[#1E8449]", border: "border-[#27AE60]", label: "Received" }
        : status === "Partial"
          ? { bg: "bg-[#FEF9E7]", text: "text-[#B7950B]", border: "border-[#F1C40F]", label: "Partial" }
          : { bg: "bg-[#FADBD8]", text: "text-[#922B21]", border: "border-[#E74C3C]", label: "Pending" };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}
      >
        {config.label}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Sales</h1>
        <Link
          href="/sales/new"
          className="inline-flex items-center min-h-[48px] px-4 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
        >
          + New Sale
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-gray-200 rounded w-16" />
                  <div className="h-4 bg-gray-200 rounded w-32" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 rounded w-28" />
                <div className="flex items-center gap-2">
                  <div className="h-3 bg-gray-200 rounded w-20" />
                  <div className="h-6 bg-gray-200 rounded-full w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !salesList || salesList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <div className="text-gray-300 text-5xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">No sales yet</h3>
          <p className="text-[#6C757D] mb-6 text-sm">
            Record your first yarn sale to start tracking revenue, margins, and receivables.
          </p>
          <Link
            href="/sales/new"
            className="inline-flex items-center min-h-[48px] px-6 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
          >
            + Add First Sale
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {salesList.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              {/* Row 1: displayId, product name, date */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#1B4F72] text-sm">
                    {s.displayId}
                  </span>
                  <span className="font-semibold text-[#2C3E50] truncate">
                    {s.productName}
                  </span>
                </div>
                <span className="text-sm text-[#6C757D] shrink-0 ml-2">
                  {formatDate(s.date)}
                </span>
              </div>

              {/* Row 2: buyer, bags, rate */}
              <div className="flex items-center gap-1.5 text-sm text-[#6C757D] mb-2">
                <span>{s.buyerName}</span>
                <span className="text-[#ADB5BD]">&middot;</span>
                <span>{s.qtyBags} bags</span>
                <span className="text-[#ADB5BD]">&middot;</span>
                <span>{formatIndianCurrency(s.ratePerKg ?? 0)}/kg</span>
              </div>

              {/* Row 3: total, status, margin */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-[#6C757D]">Total: </span>
                  <span className="font-bold text-[#2C3E50]">
                    {formatIndianCurrency(s.baseAmount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      s.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"
                    }`}
                  >
                    {formatIndianCurrency(s.grossMargin)} ({s.grossMarginPct.toFixed(1)}%)
                  </span>
                  {statusBadge(s.status)}
                </div>
              </div>

              {/* Row 4: balance (if any) */}
              {s.balanceReceivable > 0 && (
                <div className="mt-1">
                  <span className="text-sm text-[#922B21] font-medium">
                    Balance: {formatIndianCurrency(s.balanceReceivable)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
