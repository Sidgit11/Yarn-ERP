"use client";

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { cn, formatIndianCurrency } from "@/lib/utils";
import Fuse from "fuse.js";

interface TallyRow {
  name: string;
  balance: number;
  type: string; // "Debtor" or "Creditor"
}

interface ReconRow {
  tallyName: string;
  tallyBalance: number;
  tallyType: string;
  matchedName: string | null;
  sheetBalance: number | null;
  difference: number | null;
  status: "Matched" | "Minor Variance" | "Mismatch" | "Not in Sheet";
  note: string;
}

function parseTallyData(raw: string): TallyRow[] {
  const lines = raw.trim().split("\n").filter(line => line.trim());
  const rows: TallyRow[] = [];

  for (const line of lines) {
    // Support comma or tab separated
    const parts = line.split(/[,\t]/).map(p => p.trim());
    if (parts.length < 2) continue;

    const name = parts[0];
    const balanceStr = parts[1].replace(/[^0-9.\-]/g, "");
    const balance = parseFloat(balanceStr);
    if (!name || isNaN(balance)) continue;

    const type = parts[2]?.trim() || "Unknown";
    rows.push({ name, balance, type });
  }

  return rows;
}

export default function ReconPage() {
  const [tallyRaw, setTallyRaw] = useState("");
  const [tallyParsed, setTallyParsed] = useState<TallyRow[]>([]);
  const [reconDate, setReconDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [threshold, setThreshold] = useState(500);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.list.useQuery();

  // Build fuse index for fuzzy matching
  const fuse = useMemo(() => {
    if (!ledgerData) return null;
    return new Fuse(ledgerData, {
      keys: ["name"],
      threshold: 0.4,
      includeScore: true,
    });
  }, [ledgerData]);

  // Run reconciliation
  const reconResults = useMemo((): ReconRow[] => {
    if (!showResults || tallyParsed.length === 0 || !ledgerData || !fuse) return [];

    return tallyParsed.map((tRow) => {
      // Try exact match first
      const exactMatch = ledgerData.find(
        l => l.name.toLowerCase() === tRow.name.toLowerCase()
      );

      if (exactMatch) {
        const diff = Math.abs(tRow.balance - exactMatch.netBalance);
        let status: ReconRow["status"] = "Matched";
        if (diff > 0 && diff < threshold) status = "Minor Variance";
        else if (diff >= threshold) status = "Mismatch";

        return {
          tallyName: tRow.name,
          tallyBalance: tRow.balance,
          tallyType: tRow.type,
          matchedName: exactMatch.name,
          sheetBalance: exactMatch.netBalance,
          difference: Math.round((tRow.balance - exactMatch.netBalance) * 100) / 100,
          status,
          note: "",
        };
      }

      // Try fuzzy match
      const fuzzyResults = fuse.search(tRow.name);
      if (fuzzyResults.length > 0 && fuzzyResults[0].score! < 0.4) {
        const match = fuzzyResults[0].item;
        const diff = Math.abs(tRow.balance - match.netBalance);
        let status: ReconRow["status"] = "Matched";
        if (diff > 0 && diff < threshold) status = "Minor Variance";
        else if (diff >= threshold) status = "Mismatch";

        return {
          tallyName: tRow.name,
          tallyBalance: tRow.balance,
          tallyType: tRow.type,
          matchedName: match.name,
          sheetBalance: match.netBalance,
          difference: Math.round((tRow.balance - match.netBalance) * 100) / 100,
          status,
          note: "",
        };
      }

      return {
        tallyName: tRow.name,
        tallyBalance: tRow.balance,
        tallyType: tRow.type,
        matchedName: null,
        sheetBalance: null,
        difference: null,
        status: "Not in Sheet",
        note: "",
      };
    });
  }, [showResults, tallyParsed, ledgerData, fuse, threshold]);

  // Summary
  const summary = useMemo(() => {
    const total = reconResults.length;
    const matched = reconResults.filter(r => r.status === "Matched").length;
    const minor = reconResults.filter(r => r.status === "Minor Variance").length;
    const mismatch = reconResults.filter(r => r.status === "Mismatch").length;
    const notInSheet = reconResults.filter(r => r.status === "Not in Sheet").length;
    const totalDiff = reconResults
      .filter(r => r.difference !== null)
      .reduce((s, r) => s + Math.abs(r.difference!), 0);

    return { total, matched, minor, mismatch, notInSheet, totalDiff };
  }, [reconResults]);

  const handleParse = useCallback(() => {
    const parsed = parseTallyData(tallyRaw);
    setTallyParsed(parsed);
    setShowResults(true);
    setNotes({});
  }, [tallyRaw]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setTallyRaw(text);
      const parsed = parseTallyData(text);
      setTallyParsed(parsed);
      setShowResults(true);
      setNotes({});
    };
    reader.readAsText(file);
  }, []);

  const handleReset = useCallback(() => {
    setTallyRaw("");
    setTallyParsed([]);
    setShowResults(false);
    setNotes({});
  }, []);

  const STATUS_STYLES: Record<ReconRow["status"], string> = {
    Matched: "bg-[#D5F5E3] text-[#1E8449] border border-[#27AE60]",
    "Minor Variance": "bg-[#FEF9E7] text-[#B7950B] border border-[#F1C40F]",
    Mismatch: "bg-[#FADBD8] text-[#922B21] border border-[#E74C3C]",
    "Not in Sheet": "bg-[#E8E8E8] text-[#6C757D] border border-[#BDC3C7]",
  };

  const STATUS_ICONS: Record<ReconRow["status"], string> = {
    Matched: "\u2705",
    "Minor Variance": "\u26A0\uFE0F",
    Mismatch: "\u274C",
    "Not in Sheet": "\u2753",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Tally Reconciliation</h1>
        {showResults && (
          <button
            onClick={handleReset}
            className="min-h-[48px] text-base text-[#6C757D] hover:text-[#2C3E50] px-4 py-3 border border-[#DEE2E6] rounded-xl font-semibold transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Config Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
            Reconciliation Date
          </label>
          <input
            type="date"
            value={reconDate}
            onChange={e => setReconDate(e.target.value)}
            className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
            Variance Threshold
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-base font-medium">
              ₹
            </span>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value) || 0)}
              className="w-full pl-8 pr-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
              placeholder="500"
            />
          </div>
        </div>
      </div>

      {/* Data Input */}
      {!showResults && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
              Paste Tally Data
            </label>
            <p className="text-xs text-[#6C757D] mb-2">
              Format: Party Name, Balance, Type (Debtor/Creditor) - one per line, comma or tab separated
            </p>
            <textarea
              value={tallyRaw}
              onChange={e => setTallyRaw(e.target.value)}
              rows={10}
              className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base font-mono focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent resize-y"
              placeholder={"Rajesh Mills, 150000, Creditor\nPatel Textiles, 85000, Debtor\nABC Brokers, 12500, Creditor"}
            />
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleParse}
              disabled={!tallyRaw.trim() || ledgerLoading}
              className="min-h-[48px] bg-[#1B4F72] text-white px-6 py-3 rounded-xl text-base font-semibold hover:bg-[#154360] transition-colors disabled:opacity-50"
            >
              {ledgerLoading ? "Loading ledger..." : "Run Reconciliation"}
            </button>

            <span className="text-sm text-[#ADB5BD]">or</span>

            <label className="cursor-pointer min-h-[48px] inline-flex items-center bg-white border border-[#DEE2E6] text-[#6C757D] px-4 py-3 rounded-xl text-base font-semibold hover:bg-[#F8F9FA] transition-colors">
              Upload CSV
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* Results */}
      {showResults && reconResults.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-3 text-center">
              <p className="text-xs text-[#6C757D] font-medium">Total Parties</p>
              <p className="text-xl font-bold text-[#2C3E50]">{summary.total}</p>
            </div>
            <div className="bg-[#D5F5E3] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#27AE60] p-3 text-center">
              <p className="text-xs text-[#1E8449] font-medium">Matched</p>
              <p className="text-xl font-bold text-[#1E8449]">{summary.matched}</p>
            </div>
            <div className="bg-[#FEF9E7] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#F1C40F] p-3 text-center">
              <p className="text-xs text-[#B7950B] font-medium">Minor Variance</p>
              <p className="text-xl font-bold text-[#B7950B]">{summary.minor}</p>
            </div>
            <div className="bg-[#FADBD8] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#E74C3C] p-3 text-center">
              <p className="text-xs text-[#922B21] font-medium">Mismatch</p>
              <p className="text-xl font-bold text-[#922B21]">{summary.mismatch}</p>
            </div>
            <div className="bg-[#E8E8E8] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#BDC3C7] p-3 text-center">
              <p className="text-xs text-[#6C757D] font-medium">Not in Sheet</p>
              <p className="text-xl font-bold text-[#6C757D]">{summary.notInSheet}</p>
            </div>
            <div className="bg-[#EBF5FB] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-[#AED6F1] p-3 text-center">
              <p className="text-xs text-[#2980B9] font-medium">Total Diff</p>
              <p className="text-xl font-bold text-[#1B4F72]">{formatIndianCurrency(summary.totalDiff)}</p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b border-[#DEE2E6]">
                    <th className="text-left py-3 px-4 font-medium text-[#6C757D]">Tally Party</th>
                    <th className="text-right py-3 px-4 font-medium text-[#6C757D]">Tally Balance</th>
                    <th className="text-left py-3 px-4 font-medium text-[#6C757D]">Matched To</th>
                    <th className="text-right py-3 px-4 font-medium text-[#6C757D]">Sheet Balance</th>
                    <th className="text-right py-3 px-4 font-medium text-[#6C757D]">Difference</th>
                    <th className="text-center py-3 px-4 font-medium text-[#6C757D]">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-[#6C757D]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {reconResults.map((row, idx) => (
                    <tr key={idx} className={cn(
                      "border-b border-gray-100",
                      row.status === "Mismatch" && "bg-[#FADBD8]/30",
                      row.status === "Not in Sheet" && "bg-[#F8F9FA]/50"
                    )}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#2C3E50]">{row.tallyName}</div>
                        <div className="text-xs text-[#ADB5BD]">{row.tallyType}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-[#2C3E50] whitespace-nowrap">
                        {formatIndianCurrency(row.tallyBalance)}
                      </td>
                      <td className="py-3 px-4 text-[#6C757D]">
                        {row.matchedName ? (
                          <span>
                            {row.matchedName}
                            {row.matchedName.toLowerCase() !== row.tallyName.toLowerCase() && (
                              <span className="text-xs text-[#2980B9] ml-1">(fuzzy)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#ADB5BD]">--</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-medium whitespace-nowrap">
                        {row.sheetBalance !== null ? formatIndianCurrency(row.sheetBalance) : (
                          <span className="text-[#ADB5BD]">--</span>
                        )}
                      </td>
                      <td className={cn(
                        "py-3 px-4 text-right font-medium whitespace-nowrap",
                        row.difference !== null && row.difference !== 0
                          ? Math.abs(row.difference) >= threshold
                            ? "text-[#922B21]"
                            : "text-[#B7950B]"
                          : "text-[#1E8449]"
                      )}>
                        {row.difference !== null ? (
                          row.difference === 0 ? "0" : formatIndianCurrency(row.difference)
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          STATUS_STYLES[row.status]
                        )}>
                          <span>{STATUS_ICONS[row.status]}</span>
                          <span className="hidden sm:inline">{row.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={notes[idx] ?? ""}
                          onChange={e => setNotes(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="Add note..."
                          className="w-full min-w-[120px] px-2 py-2 min-h-[36px] border border-[#DEE2E6] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#2980B9] focus:border-transparent"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showResults && reconResults.length === 0 && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">No rows parsed</h3>
          <p className="text-[#6C757D] text-sm">
            Could not parse any valid rows. Check the format: Party Name, Balance, Type — one per line.
          </p>
        </div>
      )}
    </div>
  );
}
