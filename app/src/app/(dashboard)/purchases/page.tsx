"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate } from "@/lib/utils";

export default function PurchasesPage() {
  const { data: purchasesList, isLoading } = trpc.purchases.list.useQuery();

  const statusBadge = (status: string) => {
    const config =
      status === "Paid"
        ? { bg: "bg-[#D5F5E3]", text: "text-[#1E8449]", border: "border-[#27AE60]", label: "Paid" }
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
        <h1 className="text-2xl font-bold text-[#1B4F72]">Purchases</h1>
        <Link
          href="/purchases/new"
          className="inline-flex items-center min-h-[48px] px-4 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
        >
          + New Purchase
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
                <div className="h-6 bg-gray-200 rounded-full w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : !purchasesList || purchasesList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">No purchases yet</h3>
          <p className="text-[#6C757D] mb-6 text-sm">
            Record your first yarn purchase to start tracking inventory, costs, and balances.
          </p>
          <Link
            href="/purchases/new"
            className="inline-flex items-center min-h-[48px] px-6 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
          >
            + Add First Purchase
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {purchasesList.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              {/* Row 1: displayId, product name, date */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#1B4F72] text-sm">
                    {p.displayId}
                  </span>
                  <span className="font-semibold text-[#2C3E50] truncate">
                    {p.productName}
                  </span>
                </div>
                <span className="text-sm text-[#6C757D] shrink-0 ml-2">
                  {formatDate(p.date)}
                </span>
              </div>

              {/* Row 2: supplier, bags, rate */}
              <div className="flex items-center gap-1.5 text-sm text-[#6C757D] mb-2">
                <span>{p.supplierName}</span>
                <span className="text-[#ADB5BD]">&middot;</span>
                <span>{p.qtyBags} bags</span>
                <span className="text-[#ADB5BD]">&middot;</span>
                <span>{formatIndianCurrency(p.ratePerKg ?? 0)}/kg</span>
              </div>

              {/* Row 3: grand total, status */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-[#6C757D]">Grand Total: </span>
                  <span className="font-bold text-[#2C3E50]">
                    {formatIndianCurrency(p.grandTotal)}
                  </span>
                </div>
                {statusBadge(p.status)}
              </div>

              {/* Row 4: balance (if any) */}
              {p.balanceDue > 0 && (
                <div className="mt-1">
                  <span className="text-sm text-[#922B21] font-medium">
                    Balance: {formatIndianCurrency(p.balanceDue)}
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
