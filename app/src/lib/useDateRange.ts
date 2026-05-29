"use client";

import { useCallback, useEffect, useState } from "react";
import { RangePreset, ResolvedRange, resolveRange, toServerInput } from "./dateRange";

const STORAGE_KEY = "dateRange";
const DEFAULT: RangePreset = { preset: "this-month" };

function readStored(): RangePreset {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.preset === "string") return parsed as RangePreset;
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function writeStored(value: RangePreset) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    // Tell same-tab listeners (other mounted pickers) to re-read.
    window.dispatchEvent(new CustomEvent("dateRange:change"));
  } catch {
    // Storage may be unavailable (private mode). Selection just won't persist.
  }
}

export function useDateRange() {
  // SSR-safe: start with DEFAULT, then sync on mount.
  const [stored, setStored] = useState<RangePreset>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStored(readStored());
    setHydrated(true);
    const onChange = () => setStored(readStored());
    window.addEventListener("dateRange:change", onChange);
    window.addEventListener("storage", onChange); // cross-tab
    return () => {
      window.removeEventListener("dateRange:change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setRange = useCallback((next: RangePreset) => {
    setStored(next);
    writeStored(next);
  }, []);

  const resolved: ResolvedRange = resolveRange(stored);
  return {
    stored,
    resolved,
    setRange,
    serverInput: toServerInput(resolved),
    hydrated,
    isAllTime: stored.preset === "all",
  };
}
