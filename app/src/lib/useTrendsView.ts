"use client";

import { useCallback, useEffect, useState } from "react";

export type TrendsBucket = "day" | "week" | "month";

export interface TrendsView {
  bucket: TrendsBucket;
  lookback: number;
}

const STORAGE_KEY = "trendsView";
const DEFAULT: TrendsView = { bucket: "month", lookback: 12 };

// Lookback presets per bucket — used by the toolbar dropdown.
export const LOOKBACK_PRESETS: Record<TrendsBucket, number[]> = {
  day: [7, 30, 90],
  week: [8, 13, 26],
  month: [6, 12, 24],
};

function read(): TrendsView {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (parsed.bucket === "day" || parsed.bucket === "week" || parsed.bucket === "month") &&
      typeof parsed.lookback === "number"
    ) {
      return parsed as TrendsView;
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(value: TrendsView) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // private mode etc — selection won't persist; fine.
  }
}

export function useTrendsView() {
  const [view, setView] = useState<TrendsView>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setView(read());
    setHydrated(true);
  }, []);

  const setBucket = useCallback((bucket: TrendsBucket) => {
    setView((prev) => {
      // Pick a sensible default lookback for the new bucket if the
      // current one isn't in the new bucket's preset list.
      const presets = LOOKBACK_PRESETS[bucket];
      const lookback = presets.includes(prev.lookback) ? prev.lookback : presets[1];
      const next = { bucket, lookback };
      write(next);
      return next;
    });
  }, []);

  const setLookback = useCallback((lookback: number) => {
    setView((prev) => {
      const next = { ...prev, lookback };
      write(next);
      return next;
    });
  }, []);

  return { view, hydrated, setBucket, setLookback };
}
