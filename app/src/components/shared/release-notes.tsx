"use client";

import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";

// ── Bump this version string with each release ─────────────────────────────
const CURRENT_VERSION = "0.4.0";
const STORAGE_KEY = "ttp_release_seen";

const RELEASE_NOTES = {
  version: CURRENT_VERSION,
  date: "13 Apr 2026",
  title: "What's New",
  items: [
    {
      emoji: "📦",
      text: "Products page redesigned — tap any product to see inventory, purchase/sale summaries, per-buyer margins, and recent transactions",
    },
    {
      emoji: "📅",
      text: "Payment terms on sales — set Advance or X Days Credit. Overdue sales now highlighted in red across sales list, ledger, and dashboard",
    },
    {
      emoji: "🔍",
      text: "Search, sort, and filter on Purchases, Sales, and Payments lists — find any transaction instantly",
    },
    {
      emoji: "💡",
      text: "Smarter payment form — shows recent payments for the party and live balance breakdown when linked to a transaction",
    },
    {
      emoji: "🔧",
      text: "CC ledger balance calculation fixed — backdated entries now handled correctly",
    },
  ],
};

export function ReleaseNotes() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen !== CURRENT_VERSION) {
      // Small delay to not compete with page load
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={dismiss} />

      {/* Card */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles size={18} className="text-white/90" />
            <div>
              <h2 className="text-white font-bold text-base">{RELEASE_NOTES.title}</h2>
              <p className="text-white/70 text-xs">v{RELEASE_NOTES.version} &middot; {RELEASE_NOTES.date}</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-white/80" />
          </button>
        </div>

        {/* Items */}
        <div className="px-5 py-4 space-y-3">
          {RELEASE_NOTES.items.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-base leading-6 flex-shrink-0">{item.emoji}</span>
              <p className="text-[13px] text-gray-700 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4">
          <button
            onClick={dismiss}
            className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
