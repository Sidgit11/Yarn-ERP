// Date range presets and helpers for the dashboard / list-page filter.
// Server input is always { from?: ISODate, to?: ISODate } (inclusive).
// "All Time" means no from/to.

export type RangePreset =
  | { preset: "all" }
  | { preset: "this-month" }
  | { preset: "last-month" }
  | { preset: `month:${string}` }
  | { preset: "custom"; from: string; to: string };

export type ResolvedRange = { from: string | null; to: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const monthStart = (year: number, monthIdx: number) => toIso(new Date(year, monthIdx, 1));
const monthEnd = (year: number, monthIdx: number) => toIso(new Date(year, monthIdx + 1, 0));

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function resolveRange(stored: RangePreset, today: Date = new Date()): ResolvedRange {
  switch (stored.preset) {
    case "all":
      return { from: null, to: null };
    case "this-month":
      return { from: monthStart(today.getFullYear(), today.getMonth()), to: monthEnd(today.getFullYear(), today.getMonth()) };
    case "last-month": {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { from: monthStart(d.getFullYear(), d.getMonth()), to: monthEnd(d.getFullYear(), d.getMonth()) };
    }
    case "custom":
      return { from: stored.from, to: stored.to };
    default: {
      // month:YYYY-MM
      const match = /^month:(\d{4})-(\d{2})$/.exec(stored.preset);
      if (!match) return { from: null, to: null };
      const y = Number(match[1]);
      const m = Number(match[2]) - 1;
      return { from: monthStart(y, m), to: monthEnd(y, m) };
    }
  }
}

// For passing into tRPC: drop nulls.
export function toServerInput(range: ResolvedRange): { from?: string; to?: string } | undefined {
  if (!range.from && !range.to) return undefined;
  const out: { from?: string; to?: string } = {};
  if (range.from) out.from = range.from;
  if (range.to) out.to = range.to;
  return out;
}

// Dropdown options: This Month, Last Month, then N-2 months before that.
export function monthOptions(n: number, today: Date = new Date()): { preset: RangePreset["preset"]; label: string }[] {
  const opts: { preset: RangePreset["preset"]; label: string }[] = [];
  opts.push({ preset: "this-month", label: `This Month (${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()})` });
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  opts.push({ preset: "last-month", label: `Last Month (${MONTH_NAMES[lastMonth.getMonth()]} ${lastMonth.getFullYear()})` });
  for (let i = 2; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `month:${d.getFullYear()}-${pad(d.getMonth() + 1)}` as const;
    opts.push({ preset: key, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

// Compact label for the picker button.
export function formatRangeLabel(stored: RangePreset, today: Date = new Date()): string {
  if (stored.preset === "all") return "All Time";
  if (stored.preset === "this-month") return `This Month (${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()})`;
  if (stored.preset === "last-month") {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return `Last Month (${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()})`;
  }
  if (stored.preset === "custom") return `${formatHuman(stored.from)} – ${formatHuman(stored.to)}`;
  const match = /^month:(\d{4})-(\d{2})$/.exec(stored.preset);
  if (match) {
    const y = match[1];
    const m = Number(match[2]) - 1;
    return `${MONTH_NAMES[m]} ${y}`;
  }
  return "All Time";
}

// Long label for the "Showing data for …" banner.
export function formatRangeLong(stored: RangePreset, today: Date = new Date()): string {
  if (stored.preset === "all") return "all transactions";
  if (stored.preset === "custom") return `${formatHuman(stored.from)} to ${formatHuman(stored.to)}`;
  return formatRangeLabel(stored, today).replace(/^This Month \(|^Last Month \(|\)$/g, "");
}

function formatHuman(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

// Predicate for in-loop filtering (dashboard).
export function withinRange(dateIso: string, range: ResolvedRange): boolean {
  if (range.from && dateIso < range.from) return false;
  if (range.to && dateIso > range.to) return false;
  return true;
}
