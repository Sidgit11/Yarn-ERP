"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

interface MetricExplainerProps {
  title: string;
  description: string;
  formula?: string;
  action?: string;
}

export function MetricExplainer({ title, description, formula, action }: MetricExplainerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-gray-400 hover:text-gray-600 inline-flex items-center"
        aria-label={`Help: ${title}`}
      >
        <HelpCircle size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-t-2xl md:rounded-xl p-5 w-full md:max-w-md mx-auto shadow-xl animate-slide-up md:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle on mobile */}
            <div className="flex justify-center mb-3 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
              <button onClick={() => setOpen(false)} className="p-1">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* What this means */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">What this means:</p>
              <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
            </div>

            {/* How it's calculated */}
            {formula && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">How it&apos;s calculated:</p>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700 font-mono">{formula}</p>
                </div>
              </div>
            )}

            {/* Contextual tip */}
            {action && (
              <div className="mb-4 bg-amber-50 rounded-lg p-3 border border-amber-100">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">Tip:</span> {action}
                </p>
              </div>
            )}

            {/* Got it button */}
            <button
              onClick={() => setOpen(false)}
              className="w-full py-3 bg-[#1B4F72] text-white rounded-xl font-semibold text-base hover:bg-[#154360] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
