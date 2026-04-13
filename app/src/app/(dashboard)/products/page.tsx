"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FIBRE_TYPES, QUALITY_GRADES } from "@/lib/constants";
import { cn, formatIndianCurrency, formatDate } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type FibreType = (typeof FIBRE_TYPES)[number];
type QualityGrade = (typeof QUALITY_GRADES)[number];

interface ProductFormData {
  millBrand: string;
  fibreType: FibreType;
  count: string;
  qualityGrade: QualityGrade;
  hsnCode: string;
  colorShade: string;
}

const emptyForm: ProductFormData = {
  millBrand: "",
  fibreType: "PC",
  count: "",
  qualityGrade: "Standard",
  hsnCode: "",
  colorShade: "",
};

// --- Detail skeleton shown while loading expanded product ---
function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pt-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

// --- Expanded detail component ---
function ProductDetail({
  productId,
  onEdit,
  onToggleActive,
  onDelete,
  isActive,
}: {
  productId: string;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  isActive: boolean;
}) {
  const { data: detail, isLoading: detailLoading } =
    trpc.products.getDetail.useQuery(
      { id: productId },
      { enabled: !!productId }
    );

  if (detailLoading || !detail) {
    return <DetailSkeleton />;
  }

  const { inventory, purchases, sales, recentPurchases, recentSales } = detail;

  return (
    <div className="pt-4 space-y-5 border-t border-gray-100 mt-4">
      {/* Section A: Inventory */}
      <div>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#1B4F72] uppercase tracking-wider mb-2">
          <Package className="h-3.5 w-3.5" />
          Inventory
        </h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Purchased</span>
            <span className="text-[#2C3E50] font-medium">
              {inventory.totalPurchasedBags} bags / {Number(inventory.totalPurchasedKg).toFixed(1)} kg
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Sold</span>
            <span className="text-[#2C3E50] font-medium">
              {inventory.totalSoldBags} bags / {Number(inventory.totalSoldKg).toFixed(1)} kg
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6C757D]">In Hand</span>
            <span className="text-[#2C3E50] font-semibold">
              {inventory.bagsInHand} bags / {Number(inventory.kgInHand).toFixed(1)} kg
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Inventory Value</span>
            <span className="text-[#2C3E50] font-semibold">
              {formatIndianCurrency(inventory.inventoryValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Section B: Purchase Summary */}
      <div>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#1B4F72] uppercase tracking-wider mb-2">
          <ShoppingCart className="h-3.5 w-3.5" />
          Purchase Summary
        </h4>
        <div className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Total Purchases</span>
            <span className="text-[#2C3E50] font-medium">
              {purchases.count} ({formatIndianCurrency(purchases.totalBase)} total)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Avg Cost</span>
            <span className="text-[#2C3E50] font-medium">
              {formatIndianCurrency(purchases.avgCostPerKg)}/kg
            </span>
          </div>
          {purchases.suppliers.length > 0 && (
            <div className="mt-2">
              <span className="text-[#6C757D] text-xs font-medium">Suppliers</span>
              <div className="mt-1 space-y-1">
                {purchases.suppliers.map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-xs bg-[#F8F9FA] rounded-lg px-2.5 py-1.5"
                  >
                    <span className="text-[#2C3E50]">{s.name}</span>
                    <span className="text-[#6C757D]">
                      {s.count}x &middot; {formatIndianCurrency(s.totalBase)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section C: Sales Summary */}
      <div>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#1B4F72] uppercase tracking-wider mb-2">
          <TrendingUp className="h-3.5 w-3.5" />
          Sales Summary
        </h4>
        <div className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Total Sales</span>
            <span className="text-[#2C3E50] font-medium">
              {sales.count} ({formatIndianCurrency(sales.totalRevenue)} revenue)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Avg Selling Price</span>
            <span className="text-[#2C3E50] font-medium">
              {formatIndianCurrency(sales.avgSellingPrice)}/kg
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6C757D]">Gross Margin</span>
            <span
              className={cn(
                "font-semibold",
                Number(sales.grossMargin) >= 0 ? "text-[#1E8449]" : "text-[#E74C3C]"
              )}
            >
              {formatIndianCurrency(sales.grossMargin)} ({Number(sales.grossMarginPct).toFixed(1)}%)
            </span>
          </div>
          {sales.buyers.length > 0 && (
            <div className="mt-2">
              <span className="text-[#6C757D] text-xs font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />
                Buyers
              </span>
              <div className="mt-1 space-y-1">
                {sales.buyers.map((b, i) => (
                  <div
                    key={i}
                    className="bg-[#F8F9FA] rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex justify-between">
                      <span className="text-[#2C3E50] font-medium">{b.name}</span>
                      <span className="text-[#6C757D]">
                        {b.count}x &middot; {formatIndianCurrency(b.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[#6C757D]">Margin</span>
                      <span
                        className={cn(
                          "font-medium",
                          Number(b.grossMargin) >= 0 ? "text-[#1E8449]" : "text-[#E74C3C]"
                        )}
                      >
                        {formatIndianCurrency(b.grossMargin)} ({Number(b.grossMarginPct).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section D: Recent Transactions */}
      {(recentPurchases.length > 0 || recentSales.length > 0) && (
        <div>
          <h4 className="text-xs font-semibold text-[#1B4F72] uppercase tracking-wider mb-2">
            Recent Transactions
          </h4>
          <div className="space-y-2">
            {recentPurchases.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold text-[#6C757D] uppercase tracking-wider">
                  Purchases
                </span>
                <div className="mt-1 space-y-0.5">
                  {recentPurchases.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-[#F8F9FA] rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[#ADB5BD] font-mono text-[10px]">
                          {p.displayId}
                        </span>
                        <span className="text-[#2C3E50]">{p.supplierName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[#6C757D]">
                        <span>{p.qtyBags} bags</span>
                        <span>{formatIndianCurrency(p.grandTotal)}</span>
                        <span className="text-[10px]">{formatDate(p.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentSales.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold text-[#6C757D] uppercase tracking-wider">
                  Sales
                </span>
                <div className="mt-1 space-y-0.5">
                  {recentSales.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-[#F8F9FA] rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[#ADB5BD] font-mono text-[10px]">
                          {s.displayId}
                        </span>
                        <span className="text-[#2C3E50]">{s.buyerName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[#6C757D]">
                        <span>{s.qtyBags} bags</span>
                        <span
                          className={cn(
                            "font-medium",
                            Number(s.grossMargin) >= 0
                              ? "text-[#1E8449]"
                              : "text-[#E74C3C]"
                          )}
                        >
                          {formatIndianCurrency(s.grossMargin)} ({Number(s.grossMarginPct).toFixed(1)}%)
                        </span>
                        <span className="text-[10px]">{formatDate(s.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section E: Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#1B4F72] rounded-xl hover:bg-[#154360] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Product
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className={cn(
            "inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors",
            isActive
              ? "text-[#6C757D] bg-[#F8F9FA] hover:bg-gray-200"
              : "text-[#1E8449] bg-[#D5F5E3] hover:bg-[#ABEBC6]"
          )}
        >
          {isActive ? (
            <ToggleLeft className="h-4 w-4" />
          ) : (
            <ToggleRight className="h-4 w-4" />
          )}
          {isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#E74C3C] bg-[#FDEDEC] rounded-xl hover:bg-[#F5B7B1] transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ===========================
// Main Page
// ===========================
export default function ProductsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: productsList, isLoading } = trpc.products.list.useQuery();

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      closeModal();
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.products.getDetail.invalidate();
      closeModal();
    },
  });

  const toggleActiveMutation = trpc.products.toggleActive.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      utils.products.getDetail.invalidate();
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      setDeleteConfirmId(null);
      setExpandedId(null);
    },
  });

  const filteredProducts = (productsList ?? []).filter((p) =>
    p.fullName.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(product: NonNullable<typeof productsList>[number]) {
    setEditingId(product.id);
    setForm({
      millBrand: product.millBrand,
      fibreType: product.fibreType,
      count: product.count,
      qualityGrade: product.qualityGrade,
      hsnCode: product.hsnCode ?? "",
      colorShade: product.colorShade ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleSave() {
    const payload = {
      millBrand: form.millBrand,
      fibreType: form.fibreType,
      count: form.count,
      qualityGrade: form.qualityGrade,
      hsnCode: form.hsnCode || undefined,
      colorShade: form.colorShade || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const previewFullName =
    form.millBrand && form.count
      ? `${form.millBrand} ${form.fibreType} ${form.count} ${form.qualityGrade}`
      : "";

  function toggleExpand(productId: string) {
    setExpandedId((prev) => (prev === productId ? null : productId));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Products</h1>
        <button
          onClick={openCreate}
          className="min-h-[48px] bg-[#1B4F72] text-white px-4 py-3 rounded-xl text-base font-semibold hover:bg-[#154360] transition-colors"
        >
          + Add Product
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
        />
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-gray-200 rounded w-40" />
                  <div className="h-6 bg-gray-200 rounded-full w-16" />
                </div>
                <div className="h-5 bg-gray-200 rounded w-5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredProducts.length === 0 && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
            {search ? "No matches found" : "No products yet"}
          </h3>
          <p className="text-[#6C757D] mb-6 text-sm">
            {search
              ? "No products match your search. Try a different name."
              : "Add your yarn products to start recording purchases and sales."}
          </p>
          {!search && (
            <button
              onClick={openCreate}
              className="inline-flex items-center min-h-[48px] px-6 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
            >
              + Add First Product
            </button>
          )}
        </div>
      )}

      {/* Product Cards */}
      <div className="space-y-3">
        {filteredProducts.map((product) => {
          const isExpanded = expandedId === product.id;
          return (
            <div
              key={product.id}
              className={cn(
                "bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border transition-all",
                isExpanded
                  ? "border-[#AED6F1] shadow-md"
                  : "border-gray-200 hover:shadow-md"
              )}
            >
              {/* Card header - always visible */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => toggleExpand(product.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-[#2C3E50] truncate">
                      {product.fullName}
                    </h3>
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 border",
                        product.active
                          ? "bg-[#D5F5E3] text-[#1E8449] border-[#27AE60]"
                          : "bg-[#E8E8E8] text-[#6C757D] border-[#BDC3C7]"
                      )}
                    >
                      {product.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {(product.hsnCode || product.colorShade) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6C757D]">
                      {product.hsnCode && <span>HSN: {product.hsnCode}</span>}
                      {product.colorShade && <span>{product.colorShade}</span>}
                    </div>
                  )}
                </div>
                <div className="ml-2 text-[#ADB5BD]">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  <ProductDetail
                    productId={product.id}
                    onEdit={() => openEdit(product)}
                    onToggleActive={() =>
                      toggleActiveMutation.mutate({ id: product.id })
                    }
                    onDelete={() => setDeleteConfirmId(product.id)}
                    isActive={product.active}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
              Delete Product
            </h3>
            <p className="text-[#6C757D] mb-6">
              Are you sure you want to delete this product? This action cannot be
              undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="min-h-[48px] px-4 py-3 text-base font-semibold text-[#6C757D] bg-[#F8F9FA] rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: deleteConfirmId })}
                disabled={deleteMutation.isPending}
                className="min-h-[48px] px-4 py-3 text-base font-semibold text-white bg-[#E74C3C] rounded-xl hover:bg-[#C0392B] transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-[#2C3E50] mb-4">
                {editingId ? "Edit Product" : "Add Product"}
              </h2>

              <div className="space-y-4">
                {/* Mill/Brand */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Mill / Brand
                  </label>
                  <input
                    type="text"
                    value={form.millBrand}
                    onChange={(e) =>
                      setForm({ ...form, millBrand: e.target.value })
                    }
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="e.g. Vardhman"
                  />
                </div>

                {/* Fibre Type */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Fibre Type
                  </label>
                  <select
                    value={form.fibreType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        fibreType: e.target.value as FibreType,
                      })
                    }
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent bg-white"
                  >
                    {FIBRE_TYPES.map((ft) => (
                      <option key={ft} value={ft}>
                        {ft}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Count */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Count
                  </label>
                  <input
                    type="text"
                    value={form.count}
                    onChange={(e) =>
                      setForm({ ...form, count: e.target.value })
                    }
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="e.g. 30s"
                  />
                </div>

                {/* Quality Grade */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Quality Grade
                  </label>
                  <select
                    value={form.qualityGrade}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        qualityGrade: e.target.value as QualityGrade,
                      })
                    }
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent bg-white"
                  >
                    {QUALITY_GRADES.map((qg) => (
                      <option key={qg} value={qg}>
                        {qg}
                      </option>
                    ))}
                  </select>
                </div>

                {/* HSN Code */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    HSN Code{" "}
                    <span className="text-[#ADB5BD] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.hsnCode}
                    onChange={(e) =>
                      setForm({ ...form, hsnCode: e.target.value })
                    }
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="e.g. 5509"
                  />
                </div>

                {/* Color/Shade */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Color/Shade{" "}
                    <span className="text-[#ADB5BD] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.colorShade}
                    onChange={(e) =>
                      setForm({ ...form, colorShade: e.target.value })
                    }
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="e.g. White, RFD, Melange Grey"
                  />
                </div>

                {/* Full Name Preview */}
                {previewFullName && (
                  <div className="bg-[#EBF5FB] border border-[#AED6F1] rounded-xl p-3">
                    <p className="text-xs text-[#2980B9] font-medium mb-1">
                      Preview
                    </p>
                    <p className="text-sm text-[#1B4F72] font-semibold">
                      {previewFullName}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={closeModal}
                  className="flex-1 min-h-[48px] px-4 py-3 text-base font-semibold text-[#6C757D] bg-[#F8F9FA] rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.millBrand || !form.count || isSaving}
                  className="flex-1 min-h-[48px] px-4 py-3 text-base font-semibold text-white bg-[#1B4F72] rounded-xl hover:bg-[#154360] transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
