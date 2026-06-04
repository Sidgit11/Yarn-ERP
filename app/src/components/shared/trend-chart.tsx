"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIndianCurrency } from "@/lib/utils";

type ValueKind = "currency" | "bags" | "percent";

interface TrendChartProps {
  title: string;
  subtitle?: string;
  bucketLabels: string[];
  values: (number | null)[];
  kind: "bar" | "line";
  format: ValueKind;
  positiveNegative?: boolean; // bar: color by sign
  emptyHint?: string;
}

const COLOR_BAR = "#1B4F72";
const COLOR_POS = "#27AE60";
const COLOR_NEG = "#C0392B";
const COLOR_LINE = "#2980B9";

export function TrendChart({
  title,
  subtitle,
  bucketLabels,
  values,
  kind,
  format,
  positiveNegative = false,
  emptyHint,
}: TrendChartProps) {
  const data = bucketLabels.map((label, i) => ({
    label,
    value: values[i],
  }));

  const hasAnyData = values.some((v) => v !== null && Number(v) !== 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-800 tracking-wide uppercase">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="h-[220px] md:h-[260px] -ml-2">
        {!hasAnyData && emptyHint ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 px-4 text-center">
            {emptyHint}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#6C757D" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E9ECEF" }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6C757D" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => compactFormat(v, format)}
                  width={56}
                />
                <Tooltip content={<CustomTooltip format={format} />} cursor={{ fill: "rgba(27,79,114,0.06)" }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        positiveNegative
                          ? d.value !== null && Number(d.value) < 0
                            ? COLOR_NEG
                            : COLOR_POS
                          : COLOR_BAR
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#6C757D" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E9ECEF" }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6C757D" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => compactFormat(v, format)}
                  width={56}
                />
                <Tooltip content={<CustomTooltip format={format} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={COLOR_LINE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLOR_LINE }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number | string | null }>;
  label?: string | number;
  format: ValueKind;
}

function CustomTooltip({ active, payload, label, format }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const raw = payload[0].value;
  const value = raw === null || raw === undefined ? "—" : formatValue(Number(raw), format);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <div className="text-gray-500 mb-0.5">{label}</div>
      <div className="font-semibold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}

function formatValue(v: number, format: ValueKind): string {
  if (format === "currency") return formatIndianCurrency(v);
  if (format === "bags") return `${Math.round(v).toLocaleString("en-IN")} bags`;
  return `${v.toFixed(1)}%`;
}

function compactFormat(v: number, format: ValueKind): string {
  if (format === "bags") return Math.round(v).toLocaleString("en-IN");
  if (format === "percent") return `${Math.round(v)}%`;
  // currency — abbreviate to L / Cr for the axis.
  const abs = Math.abs(v);
  if (abs >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
}
