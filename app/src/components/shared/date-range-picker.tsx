"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Calendar } from "lucide-react";
import { RangePreset, formatRangeLabel, monthOptions } from "@/lib/dateRange";
import { useDateRange } from "@/lib/useDateRange";

const MONTHS_BACK = 12;

export function DateRangePicker({ className = "" }: { className?: string }) {
  const { stored, setRange, hydrated } = useDateRange();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stored.preset === "custom") {
      setCustomFrom(stored.from);
      setCustomTo(stored.to);
    }
  }, [stored]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (next: RangePreset) => {
    setRange(next);
    setOpen(false);
    setShowCustom(false);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo || customFrom > customTo) return;
    pick({ preset: "custom", from: customFrom, to: customTo });
  };

  const label = hydrated ? formatRangeLabel(stored) : "…";
  const monthOpts = monthOptions(MONTHS_BACK);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full md:w-auto min-h-[44px] inline-flex items-center justify-between md:justify-start gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Calendar size={16} className="text-gray-500 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown size={16} className={`text-gray-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 left-0 md:left-auto md:w-72 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-[70vh] overflow-y-auto">
          {!showCustom ? (
            <ul className="py-1.5">
              <li>
                <button
                  type="button"
                  onClick={() => pick({ preset: "all" })}
                  className={menuItemClass(stored.preset === "all")}
                >
                  All Time
                </button>
              </li>
              <li className="border-t border-gray-100 my-1" />
              {monthOpts.map((opt) => (
                <li key={opt.preset}>
                  <button
                    type="button"
                    onClick={() => pick({ preset: opt.preset } as RangePreset)}
                    className={menuItemClass(stored.preset === opt.preset)}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
              <li className="border-t border-gray-100 my-1" />
              <li>
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className={menuItemClass(stored.preset === "custom")}
                >
                  Custom range…
                </button>
              </li>
            </ul>
          ) : (
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {customFrom && customTo && customFrom > customTo && (
                <p className="text-xs text-red-600">From must be on or before To.</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustom(false)}
                  className="flex-1 min-h-[44px] px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!customFrom || !customTo || customFrom > customTo}
                  className="flex-1 min-h-[44px] px-3 py-2 bg-[#1B4F72] text-white rounded-lg text-sm font-semibold hover:bg-[#154360] disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function menuItemClass(active: boolean) {
  return `w-full text-left px-3 py-2.5 text-sm min-h-[44px] hover:bg-gray-50 transition-colors ${
    active ? "bg-blue-50 text-[#1B4F72] font-semibold" : "text-gray-700"
  }`;
}

// Banner shown under H1 when range != All Time.
export function ActiveRangeBanner({ showAsOfNote = false }: { showAsOfNote?: boolean }) {
  const { stored, hydrated, isAllTime } = useDateRange();
  if (!hydrated || isAllTime) return null;
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-sm text-blue-900 mb-4">
      <span className="font-medium">Showing data for {formatRangeLabel(stored)}.</span>
      {showAsOfNote && (
        <span className="text-blue-700"> Cards marked &ldquo;As of today&rdquo; are not filtered.</span>
      )}
    </div>
  );
}

// Small pill rendered next to as-of card titles when filter is active.
export function AsOfTodayPill() {
  const { isAllTime, hydrated } = useDateRange();
  if (!hydrated || isAllTime) return null;
  return (
    <span className="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-600 uppercase tracking-wide">
      As of today
    </span>
  );
}
