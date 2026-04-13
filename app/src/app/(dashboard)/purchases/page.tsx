"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function PurchasesPage() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: purchasesList, isLoading } = trpc.purchases.list.useQuery();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [filter, setFilter] = useState<"All" | "Paid" | "Partial" | "Pending">("All");

  const summaryMetrics = useMemo(() => {
    if (!purchasesList || purchasesList.length === 0) return null;
    const totalPurchases = purchasesList.length;
    const totalValue = purchasesList.reduce((sum, p) => sum + Number(p.grandTotal), 0);
    const totalBags = purchasesList.reduce((sum, p) => sum + Number(p.qtyBags), 0);
    const totalPaid = purchasesList.reduce((sum, p) => sum + Number(p.linkedPayments), 0);
    const balanceDue = purchasesList.reduce((sum, p) => sum + (Number(p.balanceDue) > 0 ? Number(p.balanceDue) : 0), 0);
    return { totalPurchases, totalValue, totalBags, totalPaid, balanceDue };
  }, [purchasesList]);

  const filteredList = useMemo(() => {
    let items = [...(purchasesList ?? [])];

    if (filter !== "All") items = items.filter((p) => p.status === filter);

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.displayId.toLowerCase().includes(q) ||
          p.productName.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      const valA = sortBy === "date" ? new Date(a.date).getTime() : Number(a.grandTotal);
      const valB = sortBy === "date" ? new Date(b.date).getTime() : Number(b.grandTotal);
      return sortDir === "desc" ? valB - valA : valA - valB;
    });

    return items;
  }, [purchasesList, search, sortBy, sortDir, filter]);

  const deleteMutation = trpc.purchases.delete.useMutation({
    onSuccess: () => {
      utils.purchases.list.invalidate();
      setDeleteConfirmId(null);
      toast.success("Purchase deleted");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete purchase");
    },
  });

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

      {/* Summary Metrics Strip */}
      {summaryMetrics && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { label: "Total Purchases", value: `${summaryMetrics.totalPurchases}` },
            { label: "Total Value", value: formatIndianCurrency(summaryMetrics.totalValue) },
            { label: "Quantity", value: `${summaryMetrics.totalBags} bags` },
            { label: "Paid", value: formatIndianCurrency(summaryMetrics.totalPaid) },
            { label: "Balance Due", value: formatIndianCurrency(summaryMetrics.balanceDue) },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex flex-col"
            >
              <span className="text-[11px] text-[#6C757D] leading-tight">{m.label}</span>
              <span className="text-sm font-semibold text-[#2C3E50] leading-tight">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search, Filter, Sort Toolbar */}
      {!isLoading && purchasesList && purchasesList.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, product, supplier..."
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
            {(["All", "Paid", "Partial", "Pending"] as const).map((chip) => (
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
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <p className="text-[#6C757D] text-sm">No matching results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
            >
              {/* Row 1: displayId, product name, date, chevron */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#1B4F72] text-sm">
                    {p.displayId}
                  </span>
                  <span className="font-semibold text-[#2C3E50] truncate">
                    {p.productName}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="text-sm text-[#6C757D]">
                    {formatDate(p.date)}
                  </span>
                  {expandedId === p.id ? (
                    <ChevronUp size={16} className="text-[#6C757D]" />
                  ) : (
                    <ChevronDown size={16} className="text-[#6C757D]" />
                  )}
                </div>
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

              {/* Expanded detail view */}
              {expandedId === p.id && (
                <div className="border-t border-gray-100 mt-3 pt-3" onClick={(e) => e.stopPropagation()}>
                  {/* Detail rows */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                    <div>
                      <span className="text-[#6C757D]">Product: </span>
                      <span className="text-[#2C3E50] font-medium">{p.productName}</span>
                    </div>
                    <div>
                      <span className="text-[#6C757D]">Supplier: </span>
                      <span className="text-[#2C3E50] font-medium">{p.supplierName}</span>
                    </div>
                    {p.viaBroker && (
                      <div>
                        <span className="text-[#6C757D]">Broker: </span>
                        <span className="text-[#2C3E50] font-medium">{p.brokerName}</span>
                      </div>
                    )}
                    {p.lotNo && (
                      <div>
                        <span className="text-[#6C757D]">Lot No: </span>
                        <span className="text-[#2C3E50] font-medium">{p.lotNo}</span>
                      </div>
                    )}
                    {p.supplierInvoiceNo && (
                      <div>
                        <span className="text-[#6C757D]">Supplier Invoice: </span>
                        <span className="text-[#2C3E50] font-medium">{p.supplierInvoiceNo}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[#6C757D]">Date: </span>
                      <span className="text-[#2C3E50] font-medium">{formatDate(p.date)}</span>
                    </div>
                    <div>
                      <span className="text-[#6C757D]">Quantity: </span>
                      <span className="text-[#2C3E50] font-medium">{p.qtyBags} bags × {p.kgPerBag} kg/bag = {p.totalKg} kg</span>
                    </div>
                    <div>
                      <span className="text-[#6C757D]">Rate: </span>
                      <span className="text-[#2C3E50] font-medium">{formatIndianCurrency(p.ratePerKg ?? 0)}/kg</span>
                    </div>
                  </div>

                  {/* Amounts breakdown */}
                  <div className="bg-[#F8F9FA] rounded-lg px-3 py-2 text-sm space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span className="text-[#6C757D]">Base Amount</span>
                      <span className="text-[#2C3E50]">{formatIndianCurrency(p.baseAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6C757D]">GST ({p.gstPct}%)</span>
                      <span className="text-[#2C3E50]">{formatIndianCurrency(p.gstAmount)}</span>
                    </div>
                    {Number(p.transport) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#6C757D]">Transport</span>
                        <span className="text-[#2C3E50]">{formatIndianCurrency(p.transport)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1">
                      <span className="text-[#2C3E50] font-bold">Grand Total</span>
                      <span className="text-[#2C3E50] font-bold">{formatIndianCurrency(p.grandTotal)}</span>
                    </div>
                  </div>

                  {/* Payment status */}
                  <div className="bg-[#F8F9FA] rounded-lg px-3 py-2 text-sm space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span className="text-[#6C757D]">Paid</span>
                      <span className="text-[#2C3E50]">{formatIndianCurrency(p.linkedPayments)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6C757D]">Balance Due</span>
                      {Number(p.balanceDue) > 0 ? (
                        <span className="text-[#922B21] font-medium">{formatIndianCurrency(p.balanceDue)}</span>
                      ) : (
                        <span className="text-[#1E8449] font-medium">Fully Paid</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[#6C757D]">Status</span>
                      {statusBadge(p.status)}
                    </div>
                    {Number(p.balanceDue) > 0 && (
                      <div className="pt-1">
                        <Link
                          href={`/payments/new?partyId=${p.supplierId}&txnId=${p.displayId}`}
                          className="text-[#1B4F72] font-semibold text-sm hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Record Payment →
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/purchases/new?edit=${p.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#1B4F72] bg-[#EBF5FB] border border-[#AED6F1] rounded-lg hover:bg-[#D6EAF8] transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Pencil size={14} />
                      Edit
                    </Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#922B21] bg-[#FADBD8] border border-[#F1948A] rounded-lg hover:bg-[#F5B7B1] transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-lg">
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
              Delete Purchase
            </h3>
            <p className="text-[#6C757D] mb-3">
              Are you sure you want to delete this purchase?
            </p>
            <div className="bg-[#FEF9E7] border border-[#F1C40F] rounded-xl px-4 py-3 mb-6">
              <p className="text-sm text-[#7D6608] font-medium">
                This will affect inventory, margins, and supplier balances. Linked payments will remain but won't be tied to this purchase. This cannot be undone.
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
