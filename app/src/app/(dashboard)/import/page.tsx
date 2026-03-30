"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ImportType = "contacts" | "products" | "purchases" | "sales";

interface ParsedRow {
  rowIndex: number;
  data: Record<string, any>;
  valid: boolean;
  errors: string[];
}

const IMPORT_TYPES: { value: ImportType; label: string; description: string }[] = [
  { value: "contacts", label: "Contacts", description: "Mills, Buyers, Brokers, Transporters" },
  { value: "products", label: "Products", description: "Yarn catalog (Mill, Fibre, Count, Grade)" },
  { value: "purchases", label: "Purchases", description: "Purchase transactions" },
  { value: "sales", label: "Sales", description: "Sale transactions" },
];

// Template definitions: headers are the actual field names (used in code),
// instructions row explains what to enter, examples show sample data.
const TEMPLATES: Record<ImportType, {
  headers: string[];
  instructions: Record<string, string>;
  examples: Record<string, string>[];
}> = {
  contacts: {
    headers: ["name", "type", "phone", "city", "brokerCommissionType", "brokerCommissionValue", "transporterRatePerBag", "notes"],
    instructions: {
      name: "REQUIRED: Contact name",
      type: "REQUIRED: Mill / Buyer / Broker / Transporter",
      phone: "Phone number (optional)",
      city: "City (optional)",
      brokerCommissionType: "Only for Broker: per_bag or percentage",
      brokerCommissionValue: "Only for Broker: commission amount",
      transporterRatePerBag: "Only for Transporter: rate per bag in Rs",
      notes: "Any notes (optional)",
    },
    examples: [
      { name: "Vardhman Spinning", type: "Mill", phone: "9876543210", city: "Ludhiana", brokerCommissionType: "", brokerCommissionValue: "", transporterRatePerBag: "", notes: "" },
      { name: "Raj Textiles", type: "Buyer", phone: "9876543211", city: "Surat", brokerCommissionType: "", brokerCommissionValue: "", transporterRatePerBag: "", notes: "" },
      { name: "Sharma Brokers", type: "Broker", phone: "9876543212", city: "Mumbai", brokerCommissionType: "per_bag", brokerCommissionValue: "5", transporterRatePerBag: "", notes: "Rs 5 per bag" },
      { name: "Krishna Transport", type: "Transporter", phone: "9876543213", city: "Ahmedabad", brokerCommissionType: "", brokerCommissionValue: "", transporterRatePerBag: "15", notes: "Rs 15 per bag" },
    ],
  },
  products: {
    headers: ["millBrand", "fibreType", "count", "qualityGrade"],
    instructions: {
      millBrand: "REQUIRED: Mill or brand name",
      fibreType: "REQUIRED: PC / Cotton / Polyester / Viscose / Nylon / Acrylic / Blended",
      count: "REQUIRED: Yarn count e.g. 30s, 40s",
      qualityGrade: "REQUIRED: Top / Standard / Economy",
    },
    examples: [
      { millBrand: "Vardhman", fibreType: "Polyester", count: "30s", qualityGrade: "Top" },
      { millBrand: "Grasim", fibreType: "Viscose", count: "40s", qualityGrade: "Standard" },
    ],
  },
  purchases: {
    headers: ["date", "supplierName", "productName", "qtyBags", "kgPerBag", "ratePerKg", "gstPct", "transport", "amountPaid"],
    instructions: {
      date: "REQUIRED: Date as YYYY-MM-DD",
      supplierName: "REQUIRED: Must match an existing Mill contact exactly",
      productName: "REQUIRED: Must match an existing product exactly (e.g. Vardhman Polyester 30s Top)",
      qtyBags: "REQUIRED: Number of bags",
      kgPerBag: "REQUIRED: Kg per bag",
      ratePerKg: "REQUIRED: Rate per kg in Rs",
      gstPct: "REQUIRED: GST percentage (e.g. 5 for 5%)",
      transport: "Transport cost in Rs (0 if none)",
      amountPaid: "Amount already paid in Rs (0 if unpaid)",
    },
    examples: [
      { date: "2026-01-15", supplierName: "Vardhman Spinning", productName: "Vardhman Polyester 30s Top", qtyBags: "20", kgPerBag: "100", ratePerKg: "150.00", gstPct: "5", transport: "300", amountPaid: "0" },
    ],
  },
  sales: {
    headers: ["date", "buyerName", "productName", "qtyBags", "kgPerBag", "ratePerKg", "gstPct", "transport", "amountReceived"],
    instructions: {
      date: "REQUIRED: Date as YYYY-MM-DD",
      buyerName: "REQUIRED: Must match an existing Buyer contact exactly",
      productName: "REQUIRED: Must match an existing product exactly",
      qtyBags: "REQUIRED: Number of bags",
      kgPerBag: "REQUIRED: Kg per bag",
      ratePerKg: "REQUIRED: Rate per kg in Rs",
      gstPct: "REQUIRED: GST percentage (e.g. 5 for 5%)",
      transport: "Transport cost in Rs (0 if none)",
      amountReceived: "Amount already received in Rs (0 if none)",
    },
    examples: [
      { date: "2026-01-20", buyerName: "Raj Textiles", productName: "Vardhman Polyester 30s Top", qtyBags: "10", kgPerBag: "100", ratePerKg: "165.00", gstPct: "5", transport: "150", amountReceived: "0" },
    ],
  },
};

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>("contacts");
  const [step, setStep] = useState<"select" | "preview" | "done">("select");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ count: number; errors?: string[] } | null>(null);

  const utils = trpc.useUtils();
  const validateContacts = trpc.import.validateContacts.useMutation();
  const validateProducts = trpc.import.validateProducts.useMutation();
  const validatePurchases = trpc.import.validatePurchases.useMutation();
  const validateSales = trpc.import.validateSales.useMutation();
  const importContacts = trpc.import.importContacts.useMutation();
  const importProducts = trpc.import.importProducts.useMutation();
  const importPurchases = trpc.import.importPurchases.useMutation();
  const importSales = trpc.import.importSales.useMutation();

  const handleDownloadTemplate = useCallback(() => {
    const template = TEMPLATES[importType];
    const wb = XLSX.utils.book_new();

    // Row 1: Instructions (what to enter in each column)
    const instructionRow = template.headers.reduce((acc, h) => {
      acc[h] = template.instructions[h] || "";
      return acc;
    }, {} as Record<string, string>);

    // Rows 2+: Example data
    const allRows = [instructionRow, ...template.examples];
    const ws = XLSX.utils.json_to_sheet(allRows, { header: template.headers });

    // Style: make instruction row stand out and set wider columns
    ws["!cols"] = template.headers.map((h) => ({
      wch: Math.max(20, (template.instructions[h] || "").length + 2),
    }));

    XLSX.utils.book_append_sheet(wb, ws, importType);
    XLSX.writeFile(wb, `SYT_Template_${importType}.xlsx`);
    toast.success("Template downloaded — Row 1 has instructions, rows below are examples. Delete instruction row before uploading.");
  }, [importType]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (jsonData.length === 0) {
        toast.error("File is empty");
        return;
      }

      // Convert numeric fields for purchases/sales
      const cleaned = jsonData.map((row: any) => {
        const cleanRow = { ...row };
        if (importType === "purchases" || importType === "sales") {
          if (cleanRow.qtyBags) cleanRow.qtyBags = Number(cleanRow.qtyBags);
          if (cleanRow.kgPerBag) cleanRow.kgPerBag = Number(cleanRow.kgPerBag);
          if (cleanRow.ratePerKg) cleanRow.ratePerKg = String(cleanRow.ratePerKg);
          if (cleanRow.gstPct) cleanRow.gstPct = String(cleanRow.gstPct);
          if (cleanRow.transport) cleanRow.transport = String(cleanRow.transport);
          if (cleanRow.amountPaid) cleanRow.amountPaid = String(cleanRow.amountPaid);
          if (cleanRow.amountReceived) cleanRow.amountReceived = String(cleanRow.amountReceived);
        }
        return cleanRow;
      });

      setRawData(cleaned);

      // Validate
      let validationResult: ParsedRow[];
      if (importType === "contacts") {
        validationResult = await validateContacts.mutateAsync({ rows: cleaned });
      } else if (importType === "products") {
        validationResult = await validateProducts.mutateAsync({ rows: cleaned });
      } else if (importType === "purchases") {
        validationResult = await validatePurchases.mutateAsync({ rows: cleaned });
      } else {
        validationResult = await validateSales.mutateAsync({ rows: cleaned });
      }

      setParsedRows(validationResult);
      setStep("preview");
    } catch (err: any) {
      toast.error("Failed to parse file: " + (err.message || "Unknown error"));
    }

    // Reset file input
    e.target.value = "";
  }, [importType, validateContacts, validateProducts, validatePurchases, validateSales]);

  const validRows = parsedRows.filter((r) => r.valid);
  const invalidRows = parsedRows.filter((r) => !r.valid);

  const handleConfirmImport = useCallback(async () => {
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    try {
      const validData = validRows.map((r) => r.data);
      let importResult: { count: number; errors?: string[] };

      if (importType === "contacts") {
        importResult = await importContacts.mutateAsync({ rows: validData as any });
      } else if (importType === "products") {
        importResult = await importProducts.mutateAsync({ rows: validData as any });
      } else if (importType === "purchases") {
        importResult = await importPurchases.mutateAsync({ rows: validData as any });
      } else {
        importResult = await importSales.mutateAsync({ rows: validData as any });
      }

      setResult(importResult);
      setStep("done");
      toast.success(`${importResult.count} ${importType} imported successfully`);

      // Invalidate relevant queries
      utils.contacts.list.invalidate();
      utils.products.list.invalidate();
      utils.purchases.list.invalidate();
      utils.sales.list.invalidate();
    } catch (err: any) {
      toast.error("Import failed: " + (err.message || "Unknown error"));
    } finally {
      setImporting(false);
    }
  }, [validRows, importType, importContacts, importProducts, importPurchases, importSales, utils]);

  const handleReset = () => {
    setStep("select");
    setParsedRows([]);
    setRawData([]);
    setResult(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">Import Data</h1>

      {step === "select" && (
        <div className="space-y-6">
          {/* Type Selection */}
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6">
            <h2 className="text-lg font-semibold text-[#2C3E50] mb-4 pl-3 border-l-4 border-[#1B4F72]">
              What do you want to import?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {IMPORT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setImportType(t.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    importType === t.value
                      ? "border-[#2980B9] bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-semibold text-[#2C3E50]">{t.label}</p>
                  <p className="text-sm text-[#6C757D] mt-1">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6">
            <h2 className="text-lg font-semibold text-[#2C3E50] mb-4 pl-3 border-l-4 border-[#27AE60]">
              Upload File
            </h2>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <button
                onClick={handleDownloadTemplate}
                className="min-h-[48px] px-6 py-3 text-base font-semibold text-[#1B4F72] bg-white border-2 border-[#1B4F72] rounded-xl hover:bg-blue-50 transition-colors"
              >
                Download {importType} Template
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer block"
              >
                <svg className="w-12 h-12 mx-auto text-[#6C757D] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-base font-medium text-[#2C3E50]">
                  Click to upload Excel or CSV
                </p>
                <p className="text-sm text-[#6C757D] mt-1">
                  .xlsx, .xls, or .csv files supported
                </p>
              </label>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg space-y-1">
              <p className="text-sm text-[#1B4F72]">
                <strong>How to use:</strong>
              </p>
              <ol className="text-sm text-[#1B4F72] list-decimal list-inside space-y-0.5">
                <li>Download the template (first row explains each column)</li>
                <li>Delete the instruction row, keep only your data</li>
                <li>Fill in your data following the column headers</li>
                <li>Upload the file — we will validate before importing</li>
              </ol>
              {importType === "purchases" && (
                <p className="text-sm text-[#B7950B] mt-2">
                  Note: Supplier and product names must match existing contacts/products exactly.
                </p>
              )}
              {importType === "sales" && (
                <p className="text-sm text-[#B7950B] mt-2">
                  Note: Buyer and product names must match existing contacts/products exactly.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 md:p-6">
            <h2 className="text-lg font-semibold text-[#2C3E50] mb-4">
              Review Import Data
            </h2>
            <div className="flex gap-4 mb-4">
              <div className="px-4 py-2 bg-[#D5F5E3] text-[#1E8449] rounded-lg font-semibold">
                {validRows.length} valid
              </div>
              {invalidRows.length > 0 && (
                <div className="px-4 py-2 bg-[#FADBD8] text-[#922B21] rounded-lg font-semibold">
                  {invalidRows.length} errors
                </div>
              )}
              <div className="px-4 py-2 bg-gray-100 text-[#6C757D] rounded-lg">
                {parsedRows.length} total rows
              </div>
            </div>

            {/* Error rows */}
            {invalidRows.length > 0 && (
              <div className="mb-4 p-4 bg-[#FADBD8] rounded-xl">
                <p className="font-semibold text-[#922B21] mb-2">Rows with errors (will be skipped):</p>
                {invalidRows.map((row) => (
                  <div key={row.rowIndex} className="text-sm text-[#922B21] mb-1">
                    Row {row.rowIndex + 1}: {row.errors.join("; ")}
                  </div>
                ))}
              </div>
            )}

            {/* Preview table */}
            {validRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 font-medium text-[#6C757D]">#</th>
                      {Object.keys(validRows[0].data).map((key) => (
                        <th key={key} className="text-left p-2 font-medium text-[#6C757D]">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 20).map((row) => (
                      <tr key={row.rowIndex} className="border-t border-gray-100">
                        <td className="p-2 text-[#6C757D]">{row.rowIndex + 1}</td>
                        {Object.values(row.data).map((val, i) => (
                          <td key={i} className="p-2 text-[#2C3E50]">
                            {String(val ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 20 && (
                  <p className="text-sm text-[#6C757D] mt-2 text-center">
                    ... and {validRows.length - 20} more rows
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleReset}
              className="min-h-[48px] px-6 py-3 text-base font-semibold text-[#6C757D] bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importing || validRows.length === 0}
              className="min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-[#27AE60] rounded-xl hover:bg-[#219A52] transition-colors disabled:opacity-50"
            >
              {importing
                ? "Importing..."
                : `Import ${validRows.length} ${importType}`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#D5F5E3] flex items-center justify-center">
            <svg className="w-8 h-8 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#2C3E50] mb-2">Import Complete</h2>
          <p className="text-[#6C757D] mb-2">
            {result.count} {importType} imported successfully.
          </p>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-4 p-3 bg-[#FEF9E7] rounded-lg text-left">
              <p className="text-sm font-semibold text-[#B7950B] mb-1">Warnings:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-sm text-[#B7950B]">{err}</p>
              ))}
            </div>
          )}
          <button
            onClick={handleReset}
            className="mt-6 min-h-[48px] px-6 py-3 text-base font-semibold text-white bg-[#1B4F72] rounded-xl hover:bg-[#154360] transition-colors"
          >
            Import More Data
          </button>
        </div>
      )}
    </div>
  );
}
