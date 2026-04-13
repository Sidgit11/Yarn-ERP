"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Pencil, Trash2, AlertTriangle, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function SalesPage() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: salesList, isLoading } = trpc.sales.list.useQuery();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [filter, setFilter] = useState<"All" | "Received" | "Partial" | "Pending" | "Overdue">("All");

  const filteredList = useMemo(() => {
    let items = [...(salesList ?? [])];

    if (filter === "Overdue") {
      items = items.filter((s) => s.isOverdue);
    } else if (filter !== "All") {
      items = items.filter((s) => s.status === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (s) =>
          s.displayId.toLowerCase().includes(q) ||
          s.productName.toLowerCase().includes(q) ||
          s.buyerName.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      const valA = sortBy === "date" ? new Date(a.date).getTime() : Number(a.baseAmount);
      const valB = sortBy === "date" ? new Date(b.date).getTime() : Number(b.baseAmount);
      return sortDir === "desc" ? valB - valA : valA - valB;
    });

    return items;
  }, [salesList, search, sortBy, sortDir, filter]);

  const deleteMutation = trpc.sales.delete.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      setDeleteConfirmId(null);
      toast.success("Sale deleted");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete sale");
    },
  });

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

      {/* Search, Filter, Sort Toolbar */}
      {!isLoading && salesList && salesList.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, product, buyer..."
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/20 focus:border-[#1B4F72]"
            />
            <button
              onClick={() => {
                if (sortBy === "date" && sortDir === "desc") setSortDir("asc");
                else if (sortBy === "date" && sortDir === "asc") { setSortBy("amount"); setSortDir("desc"); }
                else if (sortBy === "amount" && sortDir === "desc") setSortDir("asc");
                else { setSortBy("date"); setSortDir("desc"); }
              }}
              className="shrink-0 px-3 py-2 text-xs font-medium text-[#6C757D] bg-[#F8F9FA] border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              Sort: {sortBy === "date" ? "Date" : "Amount"} {sortDir === "desc" ? "\u2193" : "\u2191"}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["All", "Received", "Partial", "Pending", "Overdue"] as const).map((chip) => (
              <button
                key={chip}
                onClick={() => setFilter(chip)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filter === chip
                    ? "bg-[#1B4F72] text-white border-[#1B4F72]"
                    : "bg-white text-[#6C757D] border-gray-200 hover:bg-gray-50"
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

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
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <p className="text-[#6C757D] text-sm">No matching results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((s) => (
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
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="text-sm text-[#6C757D]">
                    {formatDate(s.date)}
                  </span>
                  <Link href={`/sales/new?edit=${s.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                    <Pencil size={15} />
                  </Link>
                  <button onClick={() => setDeleteConfirmId(s.id)} className="p-1.5 text-gray-400 hover:text-[#E74C3C] transition-colors" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
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

              {/* Row 5: overdue / due indicator */}
              {s.isOverdue ? (
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                    <AlertTriangle size={12} />
                    Overdue by {Math.abs(s.daysUntilDue!)} days
                  </span>
                </div>
              ) : s.daysUntilDue !== null && s.daysUntilDue >= 0 && s.daysUntilDue <= 3 && s.balanceReceivable > 0 ? (
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock size={12} />
                    Due in {s.daysUntilDue} days
                  </span>
                </div>
              ) : s.daysUntilDue !== null && s.daysUntilDue > 3 && s.balanceReceivable > 0 ? (
                <div className="mt-1.5">
                  <span className="text-[#6C757D] text-xs">
                    Due in {s.daysUntilDue} days
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
              Delete Sale
            </h3>
            <p className="text-[#6C757D] mb-3">
              Are you sure you want to delete this sale?
            </p>
            <div className="bg-[#FEF9E7] border border-[#F1C40F] rounded-xl px-4 py-3 mb-6">
              <p className="text-sm text-[#7D6608] font-medium">
                This will affect margins, inventory, and buyer balances. Linked payments will remain but won't be tied to this sale. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="min-h-[48px] px-4 py-3 text-base font-semibold text-[#6C757D] bg-[#F8F9FA] rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: deleteConfirmId })}
                disabled={deleteMutation.isPending}
                className="min-h-[48px] px-4 py-3 text-base font-semibold text-white bg-[#E74C3C] rounded-xl hover:bg-[#C0392B] transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
