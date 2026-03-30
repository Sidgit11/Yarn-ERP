"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { cn, parseIndianAmount, formatIndianCurrency } from "@/lib/utils";
import { PAYMENT_MODES } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Direction = "Paid" | "Received";
type PaymentMode = (typeof PAYMENT_MODES)[number];

interface PaymentFormData {
  date: string;
  partyId: string;
  direction: Direction;
  amount: string;
  mode: PaymentMode;
  againstTxnId: string;
  reference: string;
  notes: string;
}

const today = new Date().toISOString().split("T")[0];

const emptyForm: PaymentFormData = {
  date: today,
  partyId: "",
  direction: "Paid",
  amount: "",
  mode: "NEFT",
  againstTxnId: "",
  reference: "",
  notes: "",
};

export default function NewPaymentPage() {
  const router = useRouter();
  const [form, setForm] = useState<PaymentFormData>(emptyForm);
  const [viaCC, setViaCC] = useState(true);
  const [displayAmount, setDisplayAmount] = useState("");
  const utils = trpc.useUtils();

  const { data: contactsList } = trpc.contacts.list.useQuery();

  const { data: openTxns } = trpc.payments.openTransactions.useQuery(
    { partyId: form.partyId },
    { enabled: !!form.partyId }
  );

  // Smart direction: auto-set based on party type
  const selectedParty = contactsList?.find((c) => c.id === form.partyId);
  useEffect(() => {
    if (selectedParty) {
      if (selectedParty.type === "Mill" || selectedParty.type === "Broker") {
        setForm((prev) => ({ ...prev, direction: "Paid" }));
      } else if (selectedParty.type === "Buyer") {
        setForm((prev) => ({ ...prev, direction: "Received" }));
      }
    }
  }, [selectedParty]);

  const createMutation = trpc.payments.create.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate();
      if (viaCC) utils.cc.list.invalidate();
      const partyName = selectedParty?.name ?? "party";
      const parsedAmt = parseIndianAmount(form.amount);
      const formattedAmt = parsedAmt ? formatIndianCurrency(parsedAmt) : form.amount;
      const directionWord = form.direction === "Paid" ? "paid to" : "received from";
      toast.success(
        `Payment saved — ${formattedAmt} ${directionWord} ${partyName} via ${form.mode}`
      );
      router.push("/payments");
    },
    onError: (err) => {
      toast.error(err.message || "Couldn't save. Your data is safe — try again.");
    },
  });

  // Forgiving amount input: accept "5L", "10K" etc.
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
    if (!form.partyId || !form.amount || !form.date) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({
      date: form.date,
      partyId: form.partyId,
      direction: form.direction,
      amount: form.amount,
      mode: form.mode,
      againstTxnId: form.againstTxnId || undefined,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      viaCC,
    });
  }

  const canSave = form.partyId && form.amount && parseFloat(form.amount) > 0;

  const inputClass = "w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:ring-2 focus:ring-[#2980B9] focus:border-transparent outline-none bg-white";
  const labelClass = "block text-sm font-medium text-[#2C3E50] mb-1.5";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Record Payment</h1>
        <button
          onClick={() => router.push("/payments")}
          className="text-sm text-[#6C757D] hover:text-[#2C3E50] transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
        >
          Cancel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6 max-w-2xl">
        <div className="space-y-5">
          {/* Date */}
          <div>
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputClass}
            />
          </div>

          {/* Party */}
          <div>
            <label className={labelClass}>Party</label>
            <select
              value={form.partyId}
              onChange={(e) =>
                setForm({ ...form, partyId: e.target.value, againstTxnId: "" })
              }
              className={inputClass}
            >
              <option value="">Select party...</option>
              {(contactsList ?? [])
                .filter((c) => c.type !== "Broker")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className={labelClass}>Direction</label>
            <div className="flex gap-2">
              {(["Paid", "Received"] as Direction[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm({ ...form, direction: d })}
                  className={cn(
                    "flex-1 min-h-[48px] px-3 py-3 rounded-xl text-base font-semibold border transition-colors",
                    form.direction === d
                      ? d === "Paid"
                        ? "border-[#E74C3C] bg-[#E74C3C] text-white"
                        : "border-[#27AE60] bg-[#27AE60] text-white"
                      : "border-[#DEE2E6] text-[#6C757D] hover:border-[#ADB5BD]"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
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
                placeholder="e.g. 5L, 50000, 10K"
              />
            </div>
            {displayAmount && parseIndianAmount(displayAmount) !== null && displayAmount !== form.amount && (
              <p className="text-xs text-[#6C757D] mt-1">
                = {formatIndianCurrency(parseFloat(form.amount))}
              </p>
            )}
          </div>

          {/* Mode */}
          <div>
            <label className={labelClass}>Mode</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, mode: m })}
                  className={cn(
                    "min-h-[48px] px-4 py-3 rounded-xl text-base font-semibold border transition-colors",
                    form.mode === m
                      ? "border-[#1B4F72] bg-[#1B4F72] text-white"
                      : "border-[#DEE2E6] text-[#6C757D] hover:border-[#ADB5BD]"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Via CC Toggle */}
          <div className="flex items-center justify-between bg-[#F8F9FA] rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#2C3E50]">
                This payment was via CC account
              </p>
              {viaCC && (
                <p className="text-xs text-[#6C757D] mt-0.5">
                  Will auto-record CC {form.direction === "Paid" ? "Draw" : "Repay"}
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={viaCC}
              onClick={() => setViaCC(!viaCC)}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                viaCC ? "bg-[#1B4F72]" : "bg-[#DEE2E6]"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                  viaCC ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Against Txn */}
          {form.partyId && openTxns && openTxns.length > 0 && (
            <div>
              <label className={labelClass}>
                Against Transaction <span className="text-[#ADB5BD] font-normal">(optional)</span>
              </label>
              <select
                value={form.againstTxnId}
                onChange={(e) =>
                  setForm({ ...form, againstTxnId: e.target.value })
                }
                className={inputClass}
              >
                <option value="">None (general payment)</option>
                {openTxns.map((t) => (
                  <option key={t.displayId} value={t.displayId}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reference */}
          <div>
            <label className={labelClass}>
              Reference <span className="text-[#ADB5BD] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className={inputClass}
              placeholder="Cheque no, UTR, etc."
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>
              Notes <span className="text-[#ADB5BD] font-normal">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => router.push("/payments")}
            className="flex-1 min-h-[48px] px-4 py-3 text-base font-semibold text-[#6C757D] bg-[#F8F9FA] rounded-xl hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || createMutation.isPending}
            className="flex-1 min-h-[48px] px-4 py-3 text-base font-semibold text-white bg-[#1B4F72] rounded-xl hover:bg-[#154360] transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving..." : "Save Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
