"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, parseIndianAmount } from "@/lib/utils";
import { allocateCollection } from "@/server/services/collections";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  X,
  HandCoins,
  CheckCircle2,
} from "lucide-react";

type Bill = {
  displayId: string;
  balance: number;
  total: number;
  date: string;
  dueDate: string | null;
  isOverdue: boolean;
  daysOverdue: number;
};
type Party = {
  partyId: string;
  partyName: string;
  totalOutstanding: number;
  billCount: number;
  isOverdue: boolean;
  daysOverdue: number;
  bills: Bill[];
};
type StagedItem = { saleDisplayId: string; amount: number };
type BasketEntry = { partyName: string; items: StagedItem[]; total: number };

const MODES = [
  { v: "NEFT", l: "Bank / NEFT" },
  { v: "UPI", l: "UPI" },
  { v: "Cheque", l: "Cheque" },
  { v: "Cash", l: "Cash" },
  { v: "RTGS", l: "RTGS" },
] as const;

type Mode = (typeof MODES)[number]["v"];

function todayIso() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local tz
}

export default function CollectionsPage() {
  const utils = trpc.useUtils();
  const { data: parties, isLoading } = trpc.payments.collectionsInbox.useQuery();

  // Basket of staged settlements, keyed by partyId.
  const [basket, setBasket] = useState<Record<string, BasketEntry>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [mode, setMode] = useState<Mode>("NEFT");
  const [viaCC, setViaCC] = useState(true);
  const [date, setDate] = useState(todayIso());

  const basketEntries = Object.entries(basket);
  const basketCount = basketEntries.length;
  const basketTotal = useMemo(
    () => basketEntries.reduce((s, [, e]) => s + e.total, 0),
    [basketEntries]
  );

  function stage(partyId: string, partyName: string, items: StagedItem[], total: number) {
    setBasket((b) => ({ ...b, [partyId]: { partyName, items, total } }));
  }
  function unstage(partyId: string) {
    setBasket((b) => {
      const next = { ...b };
      delete next[partyId];
      return next;
    });
  }

  const recordMutation = trpc.payments.recordCollections.useMutation({
    onSuccess: (res) => {
      invalidateAll();
      setBasket({});
      setShowConfirm(false);
      const ids = res.createdPaymentIds;
      toast.success(
        `Recorded ${res.recordedCount} collection${res.recordedCount === 1 ? "" : "s"} — ${formatIndianCurrency(res.totalAmount)} received`,
        {
          action: ids.length
            ? { label: "Undo", onClick: () => undoMutation.mutate({ ids }) }
            : undefined,
        }
      );
      if (res.skipped.length > 0) {
        toast.warning(
          `${res.skipped.length} bill${res.skipped.length === 1 ? "" : "s"} skipped — already settled or changed since you opened this.`
        );
      }
    },
    onError: (err) => toast.error(err.message || "Couldn't record. Your data is safe — try again."),
  });

  const undoMutation = trpc.payments.undoCollections.useMutation({
    onSuccess: (res) => {
      invalidateAll();
      toast.success(`Undone — ${res.undoneCount} collection${res.undoneCount === 1 ? "" : "s"} reversed`);
    },
    onError: (err) => toast.error(err.message || "Couldn't undo — check the Payments list."),
  });

  function invalidateAll() {
    utils.payments.collectionsInbox.invalidate();
    utils.payments.list.invalidate();
    utils.cc.list.invalidate();
    utils.ledger.list.invalidate();
    utils.dashboard.getMetrics.invalidate();
  }

  function record() {
    const items = basketEntries.flatMap(([, e]) =>
      e.items.map((i) => ({ saleDisplayId: i.saleDisplayId, amount: String(i.amount) }))
    );
    recordMutation.mutate({ date, mode, viaCC, items });
  }

  return (
    <div className="animate-fade-in pb-28">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <HandCoins size={20} className="text-emerald-600" />
          Collections
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tap to confirm what buyers have paid you — no typing.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : !parties || parties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={40} />
          <p className="font-semibold text-gray-800">Everyone&apos;s paid up</p>
          <p className="text-sm text-gray-500 mt-1">No buyers have an outstanding balance right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {parties.map((party) => (
            <PartyRow
              key={party.partyId}
              party={party}
              staged={basket[party.partyId]}
              onStage={stage}
              onUnstage={unstage}
            />
          ))}
        </div>
      )}

      {/* Sticky basket bar — above the mobile bottom-nav, at viewport bottom on desktop */}
      {basketCount > 0 && !showConfirm && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-[220px] z-30 bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {basketCount} {basketCount === 1 ? "buyer" : "buyers"} · {formatIndianCurrency(basketTotal)}
              </p>
              <p className="text-xs text-gray-500">ready to record</p>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              className="min-h-[48px] px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-base hover:bg-emerald-700 transition-colors"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmSheet
          entries={basketEntries}
          total={basketTotal}
          mode={mode}
          setMode={setMode}
          viaCC={viaCC}
          setViaCC={setViaCC}
          date={date}
          setDate={setDate}
          onCancel={() => setShowConfirm(false)}
          onConfirm={record}
          saving={recordMutation.isPending}
        />
      )}
    </div>
  );
}

function OverdueBadge({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FADBD8] text-[#922B21]">
      <AlertTriangle size={11} />
      {days}d overdue
    </span>
  );
}

function PartyRow({
  party,
  staged,
  onStage,
  onUnstage,
}: {
  party: Party;
  staged?: BasketEntry;
  onStage: (id: string, name: string, items: StagedItem[], total: number) => void;
  onUnstage: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function stageFull() {
    onStage(
      party.partyId,
      party.partyName,
      party.bills.map((b) => ({ saleDisplayId: b.displayId, amount: b.balance })),
      party.totalOutstanding
    );
    setExpanded(false);
  }

  // Preview of a part-payment, allocated oldest-first.
  const parsedAmount = parseIndianAmount(amountInput);
  const amountAlloc =
    parsedAmount && parsedAmount > 0
      ? allocateCollection(party.bills.map((b) => ({ displayId: b.displayId, balance: b.balance })), parsedAmount)
      : [];
  const amountApplied = amountAlloc.reduce((s, a) => s + a.amount, 0);
  const amountExtra = parsedAmount ? Math.max(0, parsedAmount - amountApplied) : 0;

  function stageAmount() {
    if (!amountAlloc.length) {
      toast.error("Enter a valid amount");
      return;
    }
    onStage(
      party.partyId,
      party.partyName,
      amountAlloc.map((a) => ({ saleDisplayId: a.displayId, amount: a.amount })),
      amountApplied
    );
    setExpanded(false);
    setAmountInput("");
  }

  function stagePicked() {
    const items = party.bills
      .filter((b) => picked.has(b.displayId))
      .map((b) => ({ saleDisplayId: b.displayId, amount: b.balance }));
    if (!items.length) {
      toast.error("Pick at least one bill");
      return;
    }
    onStage(party.partyId, party.partyName, items, items.reduce((s, i) => s + i.amount, 0));
    setExpanded(false);
    setPicked(new Set());
  }

  return (
    <div className={`bg-white rounded-xl border ${staged ? "border-emerald-300" : "border-gray-200"} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 truncate">{party.partyName}</span>
              {party.isOverdue && <OverdueBadge days={party.daysOverdue} />}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatIndianCurrency(party.totalOutstanding)} across {party.billCount}{" "}
              {party.billCount === 1 ? "bill" : "bills"}
            </p>
          </div>

          {staged ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                <Check size={15} /> {formatIndianCurrency(staged.total)}
              </span>
              <button
                onClick={() => onUnstage(party.partyId)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors"
                aria-label="Remove"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={stageFull}
              className="shrink-0 min-h-[44px] px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
            >
              Received {formatIndianCurrency(party.totalOutstanding)}
            </button>
          )}
        </div>

        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Hide" : "Part payment or specific bills"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-[#F8F9FA]">
          {/* Part payment via FIFO */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Got a part payment? Enter the amount
            </label>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="e.g. 2L or 250000"
                className="flex-1 px-3 py-2.5 min-h-[44px] border border-[#DEE2E6] rounded-xl text-base outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <button
                onClick={stageAmount}
                disabled={!amountAlloc.length}
                className="min-h-[44px] px-4 bg-gray-900 text-white rounded-xl font-semibold text-sm disabled:opacity-40"
              >
                Apply
              </button>
            </div>
            {amountAlloc.length > 0 && (
              <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                {amountAlloc.map((a) => (
                  <div key={a.displayId} className="flex justify-between">
                    <span>{a.displayId}</span>
                    <span className="font-medium">{formatIndianCurrency(a.amount)}</span>
                  </div>
                ))}
                {amountExtra > 0 && (
                  <div className="flex items-start gap-1.5 text-amber-700 mt-1">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>{formatIndianCurrency(amountExtra)} extra ignored — they don&apos;t owe that much.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Specific bills */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Or tick the exact bills paid</p>
            <div className="space-y-1.5">
              {party.bills.map((b) => {
                const on = picked.has(b.displayId);
                return (
                  <button
                    key={b.displayId}
                    onClick={() =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (next.has(b.displayId)) next.delete(b.displayId);
                        else next.add(b.displayId);
                        return next;
                      })
                    }
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      on ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          on ? "bg-emerald-600 border-emerald-600" : "border-gray-300"
                        }`}
                      >
                        {on && <Check size={12} className="text-white" />}
                      </span>
                      <span className="font-medium text-gray-800">{b.displayId}</span>
                      {b.isOverdue && <span className="text-[11px] text-[#922B21]">· {b.daysOverdue}d overdue</span>}
                    </span>
                    <span className="text-gray-700">{formatIndianCurrency(b.balance)}</span>
                  </button>
                );
              })}
            </div>
            {picked.size > 0 && (
              <button
                onClick={stagePicked}
                className="mt-2 w-full min-h-[44px] px-4 py-2 bg-gray-900 text-white rounded-xl font-semibold text-sm"
              >
                Add {picked.size} {picked.size === 1 ? "bill" : "bills"} to basket
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmSheet({
  entries,
  total,
  mode,
  setMode,
  viaCC,
  setViaCC,
  date,
  setDate,
  onCancel,
  onConfirm,
  saving,
}: {
  entries: [string, BasketEntry][];
  total: number;
  mode: Mode;
  setMode: (m: Mode) => void;
  viaCC: boolean;
  setViaCC: (v: boolean) => void;
  date: string;
  setDate: (d: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Confirm collections</h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1">
          {entries.map(([partyId, e]) => (
            <div key={partyId} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-gray-800">{e.partyName}</p>
                <p className="text-xs text-gray-500">
                  {e.items.map((i) => i.saleDisplayId).join(", ")}
                </p>
              </div>
              <span className="font-semibold text-gray-900">{formatIndianCurrency(e.total)}</span>
            </div>
          ))}

          <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-lg font-bold text-emerald-700">{formatIndianCurrency(total)}</span>
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">How did they mostly pay?</label>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.v}
                  onClick={() => setMode(m.v)}
                  className={`px-3 py-2 min-h-[40px] rounded-lg text-sm font-medium border transition-colors ${
                    mode === m.v ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {/* Date + viaCC */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <label className="text-sm text-gray-600">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ml-2 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={viaCC} onChange={(e) => setViaCC(e.target.checked)} className="w-4 h-4" />
              Reduce CC
            </label>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[48px] px-4 py-3 border border-[#DEE2E6] text-[#6C757D] rounded-xl font-semibold"
          >
            Back
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Recording…" : `Record ${entries.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
