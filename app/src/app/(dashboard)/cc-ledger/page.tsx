"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate, cn, parseIndianAmount } from "@/lib/utils";
import { toast } from "sonner";

type CCEvent = "Draw" | "Repay";

interface CCFormData {
  date: string;
  amount: string;
  notes: string;
}

const today = new Date().toISOString().split("T")[0];

const emptyForm: CCFormData = {
  date: today,
  amount: "",
  notes: "",
};

export default function CCLedgerPage() {
  const [formOpen, setFormOpen] = useState<CCEvent | null>(null);
  const [form, setForm] = useState<CCFormData>(emptyForm);
  const [displayAmount, setDisplayAmount] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.cc.list.useQuery();

  const createMutation = trpc.cc.create.useMutation({
    onSuccess: () => {
      utils.cc.list.invalidate();
      const parsedAmt = parseIndianAmount(displayAmount);
      const formattedAmt = parsedAmt ? formatIndianCurrency(parsedAmt) : displayAmount;
      const newBalance = data ? formatIndianCurrency(data.currentBalance + (formOpen === "Draw" ? (parsedAmt ?? 0) : -(parsedAmt ?? 0))) : "";
      const limitPct = data ? (((data.currentBalance + (formOpen === "Draw" ? (parsedAmt ?? 0) : -(parsedAmt ?? 0))) / data.ccLimit) * 100).toFixed(0) : "";

      if (formOpen === "Draw") {
        toast.success(`CC draw of ${formattedAmt} recorded. Balance: ${newBalance} (${limitPct}% of limit)`);
      } else {
        toast.success(`CC repayment of ${formattedAmt} recorded. Balance: ${newBalance}`);
      }
      setFormOpen(null);
      setForm(emptyForm);
      setDisplayAmount("");
    },
    onError: (err) => {
      toast.error(err.message || "Couldn't save. Your data is safe — try again.");
    },
  });

  function handleAmountChange(rawValue: string) {
    setDisplayAmount(rawValue);
    const parsed = parseIndianAmount(rawValue);
    if (parsed !== null) {
      setForm({ ...form, amount: String(parsed) });
    } else if (rawValue === "") {
      setForm({ ...form, amount: "" });
    }
  }

  function handleSave() {
    if (!formOpen || !form.amount || parseFloat(form.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    createMutation.mutate({
      date: form.date,
      event: formOpen,
      amount: form.amount,
      notes: form.notes || undefined,
    });
  }

  const currentBalance = data?.currentBalance ?? 0;
  const ccLimit = data?.ccLimit ?? 5000000;
  const available = data?.available ?? ccLimit;
  const utilizationPct = data?.utilizationPct ?? 0;

  const inputClass = "w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:ring-2 focus:ring-[#2980B9] focus:border-transparent outline-none bg-white";
  const labelClass = "block text-sm font-medium text-[#2C3E50] mb-1.5";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">CC Ledger</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFormOpen("Draw");
              setForm(emptyForm);
              setDisplayAmount("");
            }}
            className="min-h-[48px] bg-[#C0392B] text-white px-4 py-3 rounded-xl text-base font-semibold hover:bg-[#A93226] transition-colors"
          >
            + Draw
          </button>
          <button
            onClick={() => {
              setFormOpen("Repay");
              setForm(emptyForm);
              setDisplayAmount("");
            }}
            className="min-h-[48px] bg-[#27AE60] text-white px-4 py-3 rounded-xl text-base font-semibold hover:bg-[#229954] transition-colors"
          >
            + Repay
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
          <p className="text-xs text-[#6C757D] uppercase tracking-wide font-medium mb-1">
            Current Balance
          </p>
          <p className="text-xl font-bold text-[#C0392B]">
            {formatIndianCurrency(currentBalance)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
          <p className="text-xs text-[#6C757D] uppercase tracking-wide font-medium mb-1">
            Available
          </p>
          <p className="text-xl font-bold text-[#27AE60]">
            {formatIndianCurrency(available)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
          <p className="text-xs text-[#6C757D] uppercase tracking-wide font-medium mb-1">
            CC Limit
          </p>
          <p className="text-xl font-bold text-[#2C3E50]">
            {formatIndianCurrency(ccLimit)}
          </p>
        </div>
      </div>

      {/* Utilization Bar */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-[#2C3E50]">Utilization</p>
          <p className="text-sm font-bold text-[#2C3E50]">
            {utilizationPct.toFixed(1)}%
          </p>
        </div>
        <div className="w-full bg-[#DEE2E6] rounded-full h-3">
          <div
            className={cn(
              "h-3 rounded-full transition-all",
              utilizationPct > 80
                ? "bg-[#C0392B]"
                : utilizationPct > 50
                  ? "bg-[#E67E22]"
                  : "bg-[#27AE60]"
            )}
            style={{ width: `${Math.min(100, utilizationPct)}%` }}
          />
        </div>
      </div>

      {/* Inline Form */}
      {formOpen && (
        <div className="bg-white rounded-xl border-2 border-[#1B4F72] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4 md:p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#2C3E50] mb-4">
            {formOpen === "Draw" ? "New CC Draw" : "Repay CC"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-base font-medium">
                  ₹
                </span>
                <input
                  type="text"
                  value={displayAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={`${inputClass} pl-8`}
                  placeholder="e.g. 10L, 50000"
                />
              </div>
              {displayAmount && parseIndianAmount(displayAmount) !== null && displayAmount !== form.amount && (
                <p className="text-xs text-[#6C757D] mt-1">
                  = {formatIndianCurrency(parseFloat(form.amount))}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>
                Notes <span className="text-[#ADB5BD] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => {
                setFormOpen(null);
                setForm(emptyForm);
                setDisplayAmount("");
              }}
              className="min-h-[48px] px-4 py-3 text-base font-semibold text-[#6C757D] bg-[#F8F9FA] rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={
                !form.amount ||
                parseFloat(form.amount) <= 0 ||
                createMutation.isPending
              }
              className={cn(
                "min-h-[48px] px-6 py-3 text-base font-semibold text-white rounded-xl transition-colors disabled:opacity-50",
                formOpen === "Draw"
                  ? "bg-[#C0392B] hover:bg-[#A93226]"
                  : "bg-[#27AE60] hover:bg-[#229954]"
              )}
            >
              {createMutation.isPending
                ? "Saving..."
                : formOpen === "Draw"
                  ? "Record Draw"
                  : "Record Repayment"}
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-6 bg-gray-200 rounded-full w-16" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-3 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-28" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-3 bg-gray-200 rounded w-20" />
                <div className="h-4 bg-gray-200 rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Entries Table */}
      {!isLoading && data && data.entries.length > 0 && (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#DEE2E6]">
                  <th className="text-left px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Event
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Running Balance
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Days
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Interest
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-[#6C757D] text-xs uppercase tracking-wide">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-100 hover:bg-[#F8F9FA]"
                  >
                    <td className="px-4 py-3 text-[#2C3E50]">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-semibold border",
                          entry.event === "Draw"
                            ? "bg-[#FADBD8] text-[#922B21] border-[#E74C3C]"
                            : "bg-[#D5F5E3] text-[#1E8449] border-[#27AE60]"
                        )}
                      >
                        {entry.event}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#2C3E50]">
                      {formatIndianCurrency(entry.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#C0392B]">
                      {formatIndianCurrency(entry.runningBalance)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#6C757D]">
                      {entry.days}
                    </td>
                    <td className="px-4 py-3 text-right text-[#6C757D]">
                      {formatIndianCurrency(entry.interest)}
                    </td>
                    <td className="px-4 py-3 text-[#6C757D] truncate max-w-[200px]">
                      {entry.notes?.startsWith("Auto:") || entry.notes?.startsWith("Auto-reversed:") ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EBF5FB] text-[#2980B9] border border-[#AED6F1]">
                            AUTO
                          </span>
                          <span className="truncate">{entry.notes.replace(/^Auto:\s*/, "").replace(/^Auto-reversed:\s*/, "")}</span>
                        </span>
                      ) : (
                        entry.notes || "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 mb-6">
            {data.entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#6C757D]">
                    {formatDate(entry.date)}
                  </span>
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold border",
                      entry.event === "Draw"
                        ? "bg-[#FADBD8] text-[#922B21] border-[#E74C3C]"
                        : "bg-[#D5F5E3] text-[#1E8449] border-[#27AE60]"
                    )}
                  >
                    {entry.event}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[#6C757D]">Amount</span>
                  <span className="font-semibold text-[#2C3E50]">
                    {formatIndianCurrency(entry.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[#6C757D]">Balance</span>
                  <span className="font-semibold text-[#C0392B]">
                    {formatIndianCurrency(entry.runningBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6C757D]">
                    Interest ({entry.days}d)
                  </span>
                  <span className="text-sm text-[#6C757D]">
                    {formatIndianCurrency(entry.interest)}
                  </span>
                </div>
                {entry.notes && (
                  <p className="text-xs text-[#ADB5BD] mt-2">
                    {entry.notes.startsWith("Auto:") || entry.notes.startsWith("Auto-reversed:") ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EBF5FB] text-[#2980B9] border border-[#AED6F1]">
                          AUTO
                        </span>
                        <span>{entry.notes.replace(/^Auto:\s*/, "").replace(/^Auto-reversed:\s*/, "")}</span>
                      </span>
                    ) : (
                      entry.notes
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Interest Summary */}
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-[#2C3E50] mb-3 uppercase tracking-wide">
              Interest Summary
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#6C757D] mb-1">
                  Calculated Interest
                </p>
                <p className="text-lg font-bold text-[#2C3E50]">
                  {formatIndianCurrency(data.calculatedInterestTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6C757D] mb-1">
                  Actual Interest (PNB)
                </p>
                <p className="text-lg font-bold text-[#2C3E50]">
                  {formatIndianCurrency(data.actualInterestTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6C757D] mb-1">Difference</p>
                <p
                  className={cn(
                    "text-lg font-bold",
                    data.interestDifference > 0
                      ? "text-[#C0392B]"
                      : data.interestDifference < 0
                        ? "text-[#27AE60]"
                        : "text-[#2C3E50]"
                  )}
                >
                  {data.interestDifference > 0 ? "+" : ""}
                  {formatIndianCurrency(data.interestDifference)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && data && data.entries.length === 0 && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">No CC entries yet</h3>
          <p className="text-[#6C757D] mb-6 text-sm">
            Record your CC draws and repayments to track utilization and interest.
          </p>
          <button
            onClick={() => {
              setFormOpen("Draw");
              setForm(emptyForm);
              setDisplayAmount("");
            }}
            className="inline-flex items-center min-h-[48px] px-6 py-3 bg-[#C0392B] text-white text-base font-semibold rounded-xl hover:bg-[#A93226] transition-colors"
          >
            + Record First Draw
          </button>
        </div>
      )}
    </div>
  );
}
