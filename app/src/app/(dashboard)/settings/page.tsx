"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency } from "@/lib/utils";
import { MONTHS } from "@/lib/constants";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ConfigFormData {
  ccLimit: string;
  ccInterestRate: string;
  defaultKgPerBag: string;
  defaultGstRate: string;
  overdueDaysThreshold: string;
}

const defaultConfig: ConfigFormData = {
  ccLimit: "5000000",
  ccInterestRate: "11",
  defaultKgPerBag: "100",
  defaultGstRate: "5",
  overdueDaysThreshold: "30",
};

// Financial year months Apr(1) - Mar(12)
const FY_MONTHS = MONTHS.map((m, i) => ({ month: m, monthIndex: i + 1 }));

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const nextYear = year + 1;
  return `${year}-${String(nextYear).slice(2)}`;
}

function DataExportSection() {
  const [exporting, setExporting] = useState(false);
  const exportQuery = trpc.export.allData.useQuery(undefined, { enabled: false });

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await exportQuery.refetch();
      if (!result.data) {
        toast.error("No data to export");
        return;
      }

      const wb = XLSX.utils.book_new();
      const sheets = [
        { name: "Contacts", data: result.data.contacts },
        { name: "Products", data: result.data.products },
        { name: "Purchases", data: result.data.purchases },
        { name: "Sales", data: result.data.sales },
        { name: "Payments", data: result.data.payments },
        { name: "CC Ledger", data: result.data.ccEntries },
      ];

      for (const sheet of sheets) {
        if (sheet.data.length > 0) {
          const ws = XLSX.utils.json_to_sheet(sheet.data);
          XLSX.utils.book_append_sheet(wb, ws, sheet.name);
        }
      }

      const today = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `TradeTexPro_Export_${today}.xlsx`);
      toast.success("Data exported successfully");
    } catch {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  }, [exportQuery]);

  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6 mb-6">
      <h2 className="text-lg font-semibold text-[#2C3E50] mb-2 pl-3 border-l-4 border-[#27AE60]">
        Data Export
      </h2>
      <p className="text-sm text-[#6C757D] mb-4">
        Download all your data as an Excel file with separate sheets for contacts,
        products, purchases, sales, payments, and CC ledger.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full sm:w-auto min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-[#27AE60] rounded-xl hover:bg-[#219A52] transition-colors disabled:opacity-50"
      >
        {exporting ? "Preparing download..." : "Download All Data (.xlsx)"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [configForm, setConfigForm] = useState<ConfigFormData>(defaultConfig);
  const [monthlyInterest, setMonthlyInterest] = useState<
    Record<string, string>
  >({});
  const [financialYear, setFinancialYear] = useState(getCurrentFY());

  const { data, isLoading } = trpc.config.get.useQuery();
  const utils = trpc.useUtils();

  const updateConfigMutation = trpc.config.update.useMutation({
    onSuccess: () => {
      utils.config.get.invalidate();
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save settings");
    },
  });

  const updateInterestMutation = trpc.config.updateMonthlyInterest.useMutation({
    onSuccess: () => {
      utils.config.get.invalidate();
      toast.success("Monthly interest saved");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save monthly interest");
    },
  });

  // Populate form when data loads
  useEffect(() => {
    if (data?.config) {
      setConfigForm({
        ccLimit: data.config.ccLimit,
        ccInterestRate: data.config.ccInterestRate,
        defaultKgPerBag: String(data.config.defaultKgPerBag),
        defaultGstRate: data.config.defaultGstRate,
        overdueDaysThreshold: String(data.config.overdueDaysThreshold),
      });
    }
    if (data?.monthlyInterest) {
      const map: Record<string, string> = {};
      for (const entry of data.monthlyInterest) {
        map[entry.month] = entry.actualInterest;
      }
      setMonthlyInterest(map);
    }
  }, [data]);

  function handleSaveConfig() {
    const kgPerBag = parseFloat(configForm.defaultKgPerBag);
    const overdueDays = parseInt(configForm.overdueDaysThreshold, 10);
    if (isNaN(kgPerBag) || kgPerBag <= 0 || isNaN(overdueDays) || overdueDays <= 0) {
      toast.error("Please enter valid numeric values");
      return;
    }
    updateConfigMutation.mutate({
      ccLimit: configForm.ccLimit,
      ccInterestRate: configForm.ccInterestRate,
      defaultKgPerBag: kgPerBag,
      defaultGstRate: configForm.defaultGstRate,
      overdueDaysThreshold: overdueDays,
    });
  }

  function handleSaveInterest() {
    const entries = FY_MONTHS.map(({ month, monthIndex }) => ({
      month,
      monthIndex,
      actualInterest: monthlyInterest[month] || "0",
    }));
    updateInterestMutation.mutate({
      financialYear,
      entries,
    });
  }

  const totalActualInterest = FY_MONTHS.reduce(
    (sum, { month }) => sum + parseFloat(monthlyInterest[month] || "0"),
    0
  );

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">Settings</h1>
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-6 space-y-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-24" />
                  <div className="h-12 bg-gray-200 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">Settings</h1>

      {/* Business Settings */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6 mb-6">
        <h2 className="text-lg font-semibold text-[#2C3E50] mb-4 pl-3 border-l-4 border-[#1B4F72]">
          Business Settings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* CC Limit */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
              CC Limit
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-base font-medium">
                ₹
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={configForm.ccLimit}
                onChange={(e) =>
                  setConfigForm({ ...configForm, ccLimit: e.target.value })
                }
                className="w-full pl-8 pr-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
              />
            </div>
          </div>

          {/* CC Interest Rate */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
              CC Interest Rate (% p.a.)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={configForm.ccInterestRate}
              onChange={(e) =>
                setConfigForm({
                  ...configForm,
                  ccInterestRate: e.target.value,
                })
              }
              className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
            />
          </div>

          {/* Default Kg/Bag */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
              Default Kg per Bag
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              value={configForm.defaultKgPerBag}
              onChange={(e) =>
                setConfigForm({
                  ...configForm,
                  defaultKgPerBag: e.target.value,
                })
              }
              className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
            />
          </div>

          {/* Default GST Rate */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
              Default GST Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={configForm.defaultGstRate}
              onChange={(e) =>
                setConfigForm({
                  ...configForm,
                  defaultGstRate: e.target.value,
                })
              }
              className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
            />
          </div>

          {/* Overdue Days */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
              Overdue Days Threshold
            </label>
            <input
              type="number"
              step="1"
              min="1"
              value={configForm.overdueDaysThreshold}
              onChange={(e) =>
                setConfigForm({
                  ...configForm,
                  overdueDaysThreshold: e.target.value,
                })
              }
              className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSaveConfig}
            disabled={updateConfigMutation.isPending}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-[#1B4F72] rounded-xl hover:bg-[#154360] transition-colors disabled:opacity-50"
          >
            {updateConfigMutation.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Data Export */}
      <DataExportSection />

      {/* Monthly CC Interest */}
      <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#2C3E50] pl-3 border-l-4 border-[#C0392B]">
            Monthly CC Interest (PNB Statement)
          </h2>
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent bg-white"
          >
            <option value="2024-25">FY 2024-25</option>
            <option value="2025-26">FY 2025-26</option>
            <option value="2026-27">FY 2026-27</option>
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {FY_MONTHS.map(({ month }) => (
            <div key={month}>
              <label className="block text-xs font-medium text-[#6C757D] mb-1">
                {month}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D] text-sm font-medium">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyInterest[month] || ""}
                  onChange={(e) =>
                    setMonthlyInterest({
                      ...monthlyInterest,
                      [month]: e.target.value,
                    })
                  }
                  className="w-full pl-8 pr-2 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="mt-4 pt-4 border-t border-[#DEE2E6] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[#6C757D]">Total Actual Interest</p>
            <p className="text-xl font-bold text-[#2C3E50]">
              {formatIndianCurrency(totalActualInterest)}
            </p>
          </div>
          <button
            onClick={handleSaveInterest}
            disabled={updateInterestMutation.isPending}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-[#1B4F72] rounded-xl hover:bg-[#154360] transition-colors disabled:opacity-50"
          >
            {updateInterestMutation.isPending
              ? "Saving..."
              : "Save Interest Data"}
          </button>
        </div>
      </div>
    </div>
  );
}
