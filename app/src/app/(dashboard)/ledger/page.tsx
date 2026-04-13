"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle } from "lucide-react";
import { cn, formatIndianCurrency, formatDate } from "@/lib/utils";

type ContactType = "Mill" | "Buyer" | "Broker" | "Transporter";
type FilterTab = "All" | "Mill" | "Buyer" | "Broker" | "Transporter" | "Overdue";

const TYPE_BADGE_COLORS: Record<ContactType, string> = {
  Mill: "bg-[#D6EAF8] text-[#2980B9] border border-[#2980B9]",
  Buyer: "bg-[#D5F5E3] text-[#27AE60] border border-[#27AE60]",
  Broker: "bg-[#FDEBD0] text-[#E67E22] border border-[#E67E22]",
  Transporter: "bg-[#F3E8FF] text-[#7C3AED] border border-[#7C3AED]",
};

const DIRECTION_BADGE: Record<string, string> = {
  Payable: "bg-[#FADBD8] text-[#922B21] border border-[#E74C3C]",
  Receivable: "bg-[#D6EAF8] text-[#2980B9] border border-[#2980B9]",
  Overpaid: "bg-[#E8E8E8] text-[#6C757D] border border-[#BDC3C7]",
};

const TABS: FilterTab[] = ["All", "Mill", "Buyer", "Broker", "Transporter", "Overdue"];

export default function LedgerPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [search, setSearch] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);

  const typeFilter = activeTab === "All" || activeTab === "Overdue" ? undefined : activeTab as "Mill" | "Buyer" | "Broker" | "Transporter";
  const { data: ledgerData, isLoading } = trpc.ledger.list.useQuery(
    typeFilter ? { type: typeFilter } : undefined
  );

  const { data: partyDetail, isLoading: detailLoading } = trpc.ledger.partyDetail.useQuery(
    { contactId: selectedPartyId! },
    { enabled: !!selectedPartyId }
  );

  // Apply filters
  const filtered = (ledgerData ?? []).filter(party => {
    // Search filter
    if (search && !party.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    // Overdue tab: show only parties with pending balance and daysSinceOldest > 30
    if (activeTab === "Overdue") {
      return party.netBalance > 0 && party.daysSinceOldest !== null && party.daysSinceOldest > 30;
    }
    return true;
  });

  // Summary stats
  const totalPayable = filtered
    .filter(p => p.direction === "Payable")
    .reduce((s, p) => s + p.netBalance, 0);
  const totalReceivable = filtered
    .filter(p => p.direction === "Receivable")
    .reduce((s, p) => s + p.netBalance, 0);
  const overdueCount = filtered
    .filter(p => p.daysSinceOldest !== null && p.daysSinceOldest > 30 && p.netBalance > 0)
    .length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Party Ledger</h1>
      </div>

      {/* Summary Cards */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
            <p className="text-xs text-[#922B21] font-medium uppercase tracking-wide">You owe them</p>
            <p className="text-lg font-bold text-[#922B21] mt-1">{formatIndianCurrency(totalPayable)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
            <p className="text-xs text-[#2980B9] font-medium uppercase tracking-wide">They owe you</p>
            <p className="text-lg font-bold text-[#2980B9] mt-1">{formatIndianCurrency(totalReceivable)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
            <p className="text-xs text-[#E67E22] font-medium uppercase tracking-wide">Overdue ({">"}30 days)</p>
            <p className="text-lg font-bold text-[#E67E22] mt-1">{overdueCount} parties</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-[#F8F9FA] rounded-xl p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedPartyId(null); }}
            className={cn(
              "flex-1 px-3 py-3 min-h-[48px] rounded-xl text-base font-medium transition-colors whitespace-nowrap",
              activeTab === tab
                ? "bg-white text-[#1B4F72] shadow-sm"
                : "text-[#6C757D] hover:text-[#2C3E50]"
            )}
          >
            {tab === "All" ? "All" : tab === "Overdue" ? "Overdue" : `${tab}s`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search parties..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
        />
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-gray-200 rounded w-32" />
                  <div className="h-6 bg-gray-200 rounded-full w-14" />
                </div>
                <div className="text-right space-y-1">
                  <div className="h-5 bg-gray-200 rounded w-24 ml-auto" />
                  <div className="h-5 bg-gray-200 rounded-full w-20 ml-auto" />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="h-3 bg-gray-200 rounded w-28" />
                <div className="h-3 bg-gray-200 rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
            {search
              ? "No matches found"
              : activeTab === "Overdue"
              ? "No overdue balances"
              : "No balances yet"}
          </h3>
          <p className="text-[#6C757D] text-sm">
            {search
              ? "No parties match your search. Try a different name."
              : activeTab === "Overdue"
              ? "All accounts are within 30 days. Looking good!"
              : "Add purchases, sales, or payments to see who owes what."}
          </p>
        </div>
      )}

      {/* Party Cards */}
      <div className="space-y-3">
        {filtered.map(party => (
          <div key={party.id}>
            <div
              className={cn(
                "bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border p-4 hover:shadow-md transition-shadow cursor-pointer",
                selectedPartyId === party.id ? "border-[#1B4F72] ring-1 ring-[#1B4F72]" : "border-gray-200",
                party.isOverdue && "border-l-4 border-l-red-400"
              )}
              onClick={() => setSelectedPartyId(selectedPartyId === party.id ? null : party.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-[#2C3E50] truncate">{party.name}</h3>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0",
                      TYPE_BADGE_COLORS[party.type as ContactType]
                    )}>
                      {party.type}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6C757D]">
                    <span>Billed: {formatIndianCurrency(party.totalBilled)}</span>
                    <span>
                      {party.type === "Buyer" ? "Received" : "Paid"}: {formatIndianCurrency(party.totalPaidOrReceived)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className={cn(
                    "text-lg font-bold",
                    party.netBalance > 0 ? "text-[#2C3E50]" : party.netBalance < 0 ? "text-[#6C757D]" : "text-[#27AE60]"
                  )}>
                    {formatIndianCurrency(Math.abs(party.netBalance))}
                  </p>
                  {party.direction && party.netBalance !== 0 && (
                    <span className={cn(
                      "inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mt-1",
                      DIRECTION_BADGE[party.direction] ?? "bg-[#E8E8E8] text-[#6C757D] border border-[#BDC3C7]"
                    )}>
                      {party.direction === "Receivable" && party.type === "Buyer"
                        ? "They owe you"
                        : party.direction === "Payable" && party.type === "Mill"
                        ? "You owe them"
                        : party.direction}
                    </span>
                  )}
                  {party.isOverdue && party.daysOverdue !== null && (
                    <div className="flex items-center gap-1 mt-1.5 bg-red-100 border border-red-200 rounded-lg px-2 py-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-700" />
                      <span className="text-xs text-red-700 font-semibold">
                        Overdue by {party.daysOverdue} days
                      </span>
                    </div>
                  )}
                  {!party.isOverdue && party.daysSinceOldest !== null && party.daysSinceOldest > 30 && party.netBalance > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 bg-[#FEF9E7] border border-[#F1C40F] rounded-lg px-2 py-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#B7950B]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      <span className="text-xs text-[#B7950B] font-medium">
                        {party.daysSinceOldest}d overdue
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drill-down Detail */}
            {selectedPartyId === party.id && (
              <div className="mt-1 bg-[#F8F9FA] border border-gray-200 rounded-xl p-4">
                {detailLoading && (
                  <div className="space-y-2 animate-pulse py-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between">
                        <div className="h-3 bg-gray-200 rounded w-1/3" />
                        <div className="h-3 bg-gray-200 rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                )}
                {!detailLoading && partyDetail && (
                  <>
                    <h4 className="text-sm font-semibold text-[#1B4F72] mb-3">
                      Transaction History — {partyDetail.contact.name}
                    </h4>
                    {partyDetail.entries.length === 0 ? (
                      <p className="text-sm text-[#6C757D] text-center py-4">No transactions found.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#DEE2E6]">
                              <th className="text-left py-2 pr-3 font-medium text-[#6C757D]">Date</th>
                              <th className="text-left py-2 pr-3 font-medium text-[#6C757D]">Type</th>
                              <th className="text-left py-2 pr-3 font-medium text-[#6C757D]">Ref</th>
                              <th className="text-left py-2 pr-3 font-medium text-[#6C757D]">Description</th>
                              <th className="text-right py-2 font-medium text-[#6C757D]">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {partyDetail.entries.map((entry, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="py-2 pr-3 text-[#2C3E50] whitespace-nowrap">
                                  {formatDate(entry.date)}
                                </td>
                                <td className="py-2 pr-3">
                                  <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
                                    entry.type === "Payment"
                                      ? "bg-[#D5F5E3] text-[#1E8449] border-[#27AE60]"
                                      : entry.type === "Purchase"
                                      ? "bg-[#D6EAF8] text-[#1B4F72] border-[#2980B9]"
                                      : entry.type === "Commission"
                                      ? "bg-[#FDEBD0] text-[#A04000] border-[#E67E22]"
                                      : "bg-[#FEF9E7] text-[#B7950B] border-[#F1C40F]"
                                  )}>
                                    {entry.type}
                                  </span>
                                </td>
                                <td className="py-2 pr-3 text-[#6C757D] font-mono text-xs">
                                  {entry.displayId}
                                </td>
                                <td className="py-2 pr-3 text-[#6C757D]">
                                  {entry.description}
                                </td>
                                <td className={cn(
                                  "py-2 text-right font-semibold whitespace-nowrap",
                                  entry.type === "Payment" ? "text-[#1E8449]" : "text-[#2C3E50]"
                                )}>
                                  {entry.type === "Payment" ? "-" : "+"}{formatIndianCurrency(entry.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
                {!detailLoading && !partyDetail && (
                  <p className="text-sm text-[#6C757D] text-center py-4">Party not found.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
