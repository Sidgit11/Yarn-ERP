"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FIBRE_TYPES, QUALITY_GRADES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type FibreType = (typeof FIBRE_TYPES)[number];
type QualityGrade = (typeof QUALITY_GRADES)[number];

interface ProductFormData {
  millBrand: string;
  fibreType: FibreType;
  count: string;
  qualityGrade: QualityGrade;
}

const emptyForm: ProductFormData = {
  millBrand: "",
  fibreType: "PC",
  count: "",
  qualityGrade: "Standard",
};

export default function ProductsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
      closeModal();
    },
  });

  const toggleActiveMutation = trpc.products.toggleActive.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      setDeleteConfirmId(null);
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
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const previewFullName = form.millBrand && form.count
    ? `${form.millBrand} ${form.fibreType} ${form.count} ${form.qualityGrade}`
    : "";

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
            <div key={i} className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 bg-gray-200 rounded w-40" />
                  <div className="h-6 bg-gray-200 rounded-full w-16" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-6 bg-gray-200 rounded-full w-11" />
                  <div className="h-5 bg-gray-200 rounded w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredProducts.length === 0 && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
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
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => openEdit(product)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
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
              </div>
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleActiveMutation.mutate({ id: product.id });
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    product.active ? "bg-green-500" : "bg-gray-300"
                  )}
                  title={product.active ? "Deactivate" : "Activate"}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      product.active ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(product.id);
                  }}
                  className="text-[#ADB5BD] hover:text-[#E74C3C] transition-colors p-2 min-h-[48px] min-w-[48px] flex items-center justify-center"
                  title="Delete product"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">Delete Product</h3>
            <p className="text-[#6C757D] mb-6">
              Are you sure you want to delete this product? This action cannot be undone.
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
                    onChange={(e) => setForm({ ...form, millBrand: e.target.value })}
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
                      setForm({ ...form, fibreType: e.target.value as FibreType })
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
                    onChange={(e) => setForm({ ...form, count: e.target.value })}
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
                      setForm({ ...form, qualityGrade: e.target.value as QualityGrade })
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

                {/* Full Name Preview */}
                {previewFullName && (
                  <div className="bg-[#EBF5FB] border border-[#AED6F1] rounded-xl p-3">
                    <p className="text-xs text-[#2980B9] font-medium mb-1">Preview</p>
                    <p className="text-sm text-[#1B4F72] font-semibold">{previewFullName}</p>
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
