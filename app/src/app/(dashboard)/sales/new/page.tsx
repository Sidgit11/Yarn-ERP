"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency } from "@/lib/utils";
import { GST_RATES } from "@/lib/constants";
import { toast } from "sonner";
import Link from "next/link";

export default function NewSalePage() {
  const router = useRouter();
  const [showReview, setShowReview] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedData, setSavedData] = useState<{ displayId: string; totalInclGst: number; buyerName: string; grossMargin: number; grossMarginPct: number } | null>(null);

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [productId, setProductId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [viaBroker, setViaBroker] = useState(false);
  const [brokerId, setBrokerId] = useState("");
  const [qtyBags, setQtyBags] = useState<number | "">("");
  const [kgPerBag, setKgPerBag] = useState<number>(100);
  const [ratePerKg, setRatePerKg] = useState<number | "">("");
  const [gstPct, setGstPct] = useState("5");
  const [transport, setTransport] = useState<number | "">("");
  const [amountReceived, setAmountReceived] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  // Queries
  const { data: productsList } = trpc.products.list.useQuery();
  const { data: buyers } = trpc.contacts.list.useQuery({ type: "Buyer" });
  const { data: brokers } = trpc.contacts.list.useQuery({ type: "Broker" });
  const { data: avgCostPerKg } = trpc.purchases.avgCostByProduct.useQuery(
    { productId },
    { enabled: !!productId }
  );

  // Get selected broker details for commission calculation
  const selectedBroker = brokers?.find((b) => b.id === brokerId);

  // Mutation
  const createSale = trpc.sales.create.useMutation({
    onSuccess: (data) => {
      const buyerName = selectedBuyer?.name ?? "Buyer";
      const margin = computed.grossMargin;
      const marginPct = computed.grossMarginPct;
      toast.success(
        `Sale ${data?.displayId} saved — ${formatIndianCurrency(computed.totalInclGst)} to ${buyerName}. Margin: ${formatIndianCurrency(margin)} (${marginPct.toFixed(1)}%)`
      );
      setSavedData({
        displayId: data?.displayId ?? "",
        totalInclGst: computed.totalInclGst,
        buyerName,
        grossMargin: margin,
        grossMarginPct: marginPct,
      });
      setSaved(true);
    },
    onError: (err) => {
      toast.error(`Couldn't save. Your data is safe — try again. ${err.message}`);
    },
  });

  // Computed values
  const computed = useMemo(() => {
    const bags = typeof qtyBags === "number" ? qtyBags : 0;
    const rate = typeof ratePerKg === "number" ? ratePerKg : 0;
    const trans = typeof transport === "number" ? transport : 0;
    const received = typeof amountReceived === "number" ? amountReceived : 0;
    const gst = parseFloat(gstPct);
    const avgCost = avgCostPerKg ?? 0;

    const totalKg = bags * kgPerBag;
    const baseAmount = totalKg * rate;
    const gstAmount = (baseAmount * gst) / 100;
    const totalInclGst = baseAmount + gstAmount;
    const cogs = avgCost * totalKg;

    // Broker commission
    let brokerCommission = 0;
    if (viaBroker && selectedBroker) {
      if (selectedBroker.brokerCommissionType === "per_bag") {
        brokerCommission = bags * parseFloat(selectedBroker.brokerCommissionValue ?? "0");
      } else if (selectedBroker.brokerCommissionType === "percentage") {
        brokerCommission = (baseAmount * parseFloat(selectedBroker.brokerCommissionValue ?? "0")) / 100;
      }
    }

    const grossMargin = baseAmount - cogs - trans - brokerCommission;
    const grossMarginPct = baseAmount > 0 ? (grossMargin / baseAmount) * 100 : 0;
    const balanceReceivable = totalInclGst - received;

    return {
      totalKg,
      baseAmount,
      gstAmount,
      totalInclGst,
      avgCost,
      cogs,
      brokerCommission,
      grossMargin,
      grossMarginPct,
      balanceReceivable,
    };
  }, [qtyBags, kgPerBag, ratePerKg, gstPct, transport, amountReceived, avgCostPerKg, viaBroker, selectedBroker]);

  const selectedProduct = productsList?.find((p) => p.id === productId);
  const selectedBuyer = buyers?.find((b) => b.id === buyerId);
  const selectedBrokerDisplay = brokers?.find((b) => b.id === brokerId);

  const canSubmit =
    date && productId && buyerId && typeof qtyBags === "number" && qtyBags > 0 && kgPerBag > 0 && typeof ratePerKg === "number" && ratePerKg > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createSale.mutate({
      date,
      productId,
      buyerId,
      viaBroker,
      brokerId: viaBroker && brokerId ? brokerId : undefined,
      qtyBags: qtyBags as number,
      kgPerBag,
      ratePerKg: String(ratePerKg),
      gstPct,
      transport: String(typeof transport === "number" ? transport : 0),
      amountReceived: String(typeof amountReceived === "number" ? amountReceived : 0),
    });
  };

  // Post-save quick actions
  if (saved && savedData) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-6 text-center space-y-6">
          <div className="w-16 h-16 bg-[#D5F5E3] rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[#1E8449]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#2C3E50]">Sale Saved</h2>
            <p className="text-[#6C757D] mt-1">
              {savedData.displayId} — {formatIndianCurrency(savedData.totalInclGst)} to {savedData.buyerName}
            </p>
            <p className={`text-sm font-medium mt-1 ${savedData.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}`}>
              Margin: {formatIndianCurrency(savedData.grossMargin)} ({savedData.grossMarginPct.toFixed(1)}%)
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/payments/new"
              className="w-full min-h-[48px] flex items-center justify-center px-4 py-3 bg-[#2980B9] text-white rounded-xl font-semibold text-base hover:bg-[#2471A3] transition-colors"
            >
              + Record Payment
            </Link>
            <Link
              href="/sales/new"
              className="w-full min-h-[48px] flex items-center justify-center px-4 py-3 border-2 border-[#1B4F72] text-[#1B4F72] rounded-xl font-semibold text-base hover:bg-[#EBF5FB] transition-colors"
            >
              + New Sale
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (showReview) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-[#D5F5E3] rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-[#1E8449]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[#2C3E50]">Review Your Sale</h1>
          </div>

          <div className="border-t border-[#DEE2E6]" />

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6C757D]">Product</span>
              <span className="font-medium text-[#2C3E50]">{selectedProduct?.fullName ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6C757D]">Buyer</span>
              <span className="font-medium text-[#2C3E50]">{selectedBuyer?.name ?? "-"}</span>
            </div>
            {viaBroker && selectedBrokerDisplay && (
              <div className="flex justify-between">
                <span className="text-[#6C757D]">Broker</span>
                <span className="font-medium text-[#2C3E50]">{selectedBrokerDisplay.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#6C757D]">Quantity</span>
              <span className="font-medium text-[#2C3E50]">
                {qtyBags} bags x {kgPerBag} kg = {computed.totalKg.toLocaleString("en-IN")}kg
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6C757D]">Rate</span>
              <span className="font-medium text-[#2C3E50]">{formatIndianCurrency(typeof ratePerKg === "number" ? ratePerKg : 0)}/kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6C757D]">Base</span>
              <span className="font-medium text-[#2C3E50]">{formatIndianCurrency(computed.baseAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6C757D]">GST {gstPct}%</span>
              <span className="font-medium text-[#2C3E50]">{formatIndianCurrency(computed.gstAmount)}</span>
            </div>
            {(typeof transport === "number" && transport > 0) && (
              <div className="flex justify-between">
                <span className="text-[#6C757D]">Transport</span>
                <span className="font-medium text-[#2C3E50]">{formatIndianCurrency(transport)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-[#DEE2E6]" />

          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-[#2C3E50] uppercase tracking-wide">TOTAL</span>
            <span className="text-xl font-bold text-[#1B4F72]">
              {formatIndianCurrency(computed.totalInclGst)}
            </span>
          </div>

          {/* Margin Preview in Review */}
          <div className={`border rounded-xl p-4 ${computed.grossMargin >= 0 ? "bg-[#D5F5E3] border-[#27AE60]" : "bg-[#FADBD8] border-[#E74C3C]"}`}>
            <h3 className={`text-sm font-semibold mb-2 ${computed.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}`}>
              Margin Summary
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6C757D]">Avg Cost/kg</span>
                <span className="font-medium">{formatIndianCurrency(computed.avgCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C757D]">COGS</span>
                <span className="font-medium">{formatIndianCurrency(computed.cogs)}</span>
              </div>
              {computed.brokerCommission > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#6C757D]">Broker Commission</span>
                  <span className="font-medium">{formatIndianCurrency(computed.brokerCommission)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-current/20">
                <span className={computed.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}>
                  Gross Margin
                </span>
                <span className={computed.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}>
                  {formatIndianCurrency(computed.grossMargin)} ({computed.grossMarginPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {computed.balanceReceivable > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#922B21] font-medium">Balance Receivable</span>
              <span className="text-[#922B21] font-bold">{formatIndianCurrency(computed.balanceReceivable)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowReview(false)}
              className="flex-1 min-h-[48px] px-4 py-3 border border-[#DEE2E6] text-[#6C757D] rounded-xl font-semibold text-base hover:bg-[#F8F9FA] transition-colors"
            >
              &larr; Edit
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createSale.isPending}
              className="flex-1 min-h-[48px] px-4 py-3 bg-[#27AE60] text-white rounded-xl font-semibold text-base hover:bg-[#229954] transition-colors disabled:opacity-50"
            >
              {createSale.isPending ? "Saving..." : "Confirm \u2713"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:ring-2 focus:ring-[#2980B9] focus:border-transparent outline-none bg-white";
  const labelClass = "block text-sm font-medium text-[#2C3E50] mb-1.5";

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">New Sale</h1>

      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-6 space-y-5">
        {/* Date */}
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Product */}
        <div>
          <label className={labelClass}>Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select product...</option>
            {productsList?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Buyer */}
        <div>
          <label className={labelClass}>Buyer</label>
          <select
            value={buyerId}
            onChange={(e) => setBuyerId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select buyer...</option>
            {buyers?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Via Broker */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer min-h-[48px]">
            <input
              type="checkbox"
              checked={viaBroker}
              onChange={(e) => {
                setViaBroker(e.target.checked);
                if (!e.target.checked) setBrokerId("");
              }}
              className="w-5 h-5 rounded border-[#DEE2E6] text-[#1B4F72] focus:ring-[#2980B9]"
            />
            <span className="text-sm font-medium text-[#2C3E50]">Via Broker</span>
          </label>
        </div>

        {/* Broker dropdown */}
        {viaBroker && (
          <div>
            <label className={labelClass}>Broker</label>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select broker...</option>
              {brokers?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Qty and Kg per Bag */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Qty Bags</label>
            <input
              type="number"
              value={qtyBags}
              onChange={(e) => setQtyBags(e.target.value ? parseInt(e.target.value, 10) : "")}
              min={1}
              placeholder="e.g. 50"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Kg per Bag</label>
            <input
              type="number"
              value={kgPerBag}
              onChange={(e) => setKgPerBag(parseInt(e.target.value, 10) || 100)}
              min={1}
              className={inputClass}
            />
          </div>
        </div>

        {/* Rate per Kg */}
        <div>
          <label className={labelClass}>Rate per Kg</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-base font-medium">
              ₹
            </span>
            <input
              type="number"
              value={ratePerKg}
              onChange={(e) => setRatePerKg(e.target.value ? parseFloat(e.target.value) : "")}
              min={0}
              step="0.01"
              placeholder="e.g. 170.00"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        {/* Live Calculation */}
        <div className="bg-[#EBF5FB] border border-[#AED6F1] rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-[#1B4F72] mb-2">Live Calculation</h3>
          <div className="flex justify-between text-sm">
            <span className="text-[#2980B9]">Total Kg</span>
            <span className="font-medium text-[#1B4F72]">{computed.totalKg.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#2980B9]">Base Amount</span>
            <span className="font-medium text-[#1B4F72]">{formatIndianCurrency(computed.baseAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#2980B9]">GST ({gstPct}%)</span>
            <span className="font-medium text-[#1B4F72]">{formatIndianCurrency(computed.gstAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#2980B9]">Total incl. GST</span>
            <span className="font-medium text-[#1B4F72]">{formatIndianCurrency(computed.totalInclGst)}</span>
          </div>
        </div>

        {/* GST */}
        <div>
          <label className={labelClass}>GST %</label>
          <select
            value={gstPct}
            onChange={(e) => setGstPct(e.target.value)}
            className={inputClass}
          >
            {GST_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Transport */}
        <div>
          <label className={labelClass}>
            Transport <span className="text-[#ADB5BD] font-normal">(optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-base font-medium">
              ₹
            </span>
            <input
              type="number"
              value={transport}
              onChange={(e) => setTransport(e.target.value ? parseFloat(e.target.value) : "")}
              min={0}
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        {/* Margin Preview */}
        <div className={`border rounded-xl p-4 ${computed.grossMargin >= 0 ? "bg-[#D5F5E3] border-[#27AE60]" : "bg-[#FADBD8] border-[#E74C3C]"}`}>
          <h3 className={`text-sm font-semibold mb-3 ${computed.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}`}>
            Margin Preview
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6C757D]">Avg Cost/kg</span>
              <span className="font-medium">
                {productId ? formatIndianCurrency(computed.avgCost) : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6C757D]">COGS</span>
              <span className="font-medium">{formatIndianCurrency(computed.cogs)}</span>
            </div>
            {computed.brokerCommission > 0 && (
              <div className="flex justify-between">
                <span className="text-[#6C757D]">Broker Commission</span>
                <span className="font-medium">{formatIndianCurrency(computed.brokerCommission)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-current/20 font-bold">
              <span className={computed.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}>
                Gross Margin
              </span>
              <span className={computed.grossMargin >= 0 ? "text-[#1E8449]" : "text-[#922B21]"}>
                {formatIndianCurrency(computed.grossMargin)} ({computed.grossMarginPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Amount Received */}
        <div>
          <label className={labelClass}>Amount Received <span className="text-[#ADB5BD] font-normal">(optional)</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-base font-medium">
              ₹
            </span>
            <input
              type="number"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value ? parseFloat(e.target.value) : "")}
              min={0}
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>
            Notes <span className="text-[#ADB5BD] font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes..."
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Balance Receivable */}
        <div className="bg-[#FADBD8] border border-[#E74C3C] rounded-xl p-4">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-[#922B21]">BALANCE RECEIVABLE</span>
            <span className="text-lg font-bold text-[#922B21]">
              {formatIndianCurrency(computed.balanceReceivable)}
            </span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/sales")}
            className="flex-1 min-h-[48px] px-4 py-3 border border-[#DEE2E6] text-[#6C757D] rounded-xl font-semibold text-base hover:bg-[#F8F9FA] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setShowReview(true)}
            disabled={!canSubmit}
            className="flex-1 min-h-[48px] px-4 py-3 bg-[#1B4F72] text-white rounded-xl font-semibold text-base hover:bg-[#154360] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review & Save
          </button>
        </div>
      </div>
    </div>
  );
}
