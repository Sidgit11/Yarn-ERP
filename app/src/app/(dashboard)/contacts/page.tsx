"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CONTACT_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type ContactType = "Mill" | "Buyer" | "Broker";
type FilterTab = "All" | ContactType;

const TYPE_BADGE_COLORS: Record<ContactType, string> = {
  Mill: "bg-[#D6EAF8] text-[#2980B9] border border-[#2980B9]",
  Buyer: "bg-[#D5F5E3] text-[#27AE60] border border-[#27AE60]",
  Broker: "bg-[#FDEBD0] text-[#E67E22] border border-[#E67E22]",
};

interface ContactFormData {
  name: string;
  type: ContactType;
  phone: string;
  city: string;
  brokerCommissionType: "per_bag" | "percentage";
  brokerCommissionValue: string;
  notes: string;
}

const emptyForm: ContactFormData = {
  name: "",
  type: "Mill",
  phone: "",
  city: "",
  brokerCommissionType: "per_bag",
  brokerCommissionValue: "",
  notes: "",
};

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const typeFilter = activeTab === "All" ? undefined : activeTab;
  const { data: contactsList, isLoading } = trpc.contacts.list.useQuery(
    typeFilter ? { type: typeFilter } : undefined
  );

  const createMutation = trpc.contacts.create.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate();
      closeModal();
    },
  });

  const updateMutation = trpc.contacts.update.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate();
      closeModal();
    },
  });

  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate();
      setDeleteConfirmId(null);
    },
  });

  const filteredContacts = (contactsList ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(contact: NonNullable<typeof contactsList>[number]) {
    setEditingId(contact.id);
    setForm({
      name: contact.name,
      type: contact.type,
      phone: contact.phone ?? "",
      city: contact.city ?? "",
      brokerCommissionType: contact.brokerCommissionType ?? "per_bag",
      brokerCommissionValue: contact.brokerCommissionValue ?? "",
      notes: contact.notes ?? "",
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
      name: form.name,
      type: form.type,
      phone: form.phone || undefined,
      city: form.city || undefined,
      brokerCommissionType: form.type === "Broker" ? form.brokerCommissionType : undefined,
      brokerCommissionValue: form.type === "Broker" && form.brokerCommissionValue ? form.brokerCommissionValue : undefined,
      notes: form.notes || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const tabs: FilterTab[] = ["All", ...CONTACT_TYPES];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Contacts</h1>
        <button
          onClick={openCreate}
          className="min-h-[48px] bg-[#1B4F72] text-white px-4 py-3 rounded-xl text-base font-semibold hover:bg-[#154360] transition-colors"
        >
          + Add Contact
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-[#F8F9FA] rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-3 py-3 min-h-[48px] rounded-xl text-base font-medium transition-colors",
              activeTab === tab
                ? "bg-white text-[#1B4F72] shadow-sm"
                : "text-[#6C757D] hover:text-[#2C3E50]"
            )}
          >
            {tab === "All" ? "All" : `${tab}s`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search contacts..."
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
              <div className="flex items-center gap-2">
                <div className="h-4 bg-gray-200 rounded w-36" />
                <div className="h-6 bg-gray-200 rounded-full w-14" />
              </div>
              <div className="flex gap-4">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredContacts.length === 0 && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
            {search ? "No matches found" : "No contacts yet"}
          </h3>
          <p className="text-[#6C757D] mb-6 text-sm">
            {search
              ? "No contacts match your search. Try a different name."
              : "Add your mills, buyers, and brokers to get started."}
          </p>
          {!search && (
            <button
              onClick={openCreate}
              className="inline-flex items-center min-h-[48px] px-6 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
            >
              + Add First Contact
            </button>
          )}
        </div>
      )}

      {/* Contact Cards */}
      <div className="space-y-3">
        {filteredContacts.map((contact) => (
          <div
            key={contact.id}
            className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => openEdit(contact)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-[#2C3E50] truncate">{contact.name}</h3>
                  <span
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0",
                      TYPE_BADGE_COLORS[contact.type]
                    )}
                  >
                    {contact.type}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6C757D]">
                  {contact.phone && <span>{contact.phone}</span>}
                  {contact.city && <span>{contact.city}</span>}
                </div>
                {contact.type === "Broker" && contact.brokerCommissionValue && (
                  <div className="mt-1 text-sm text-orange-700">
                    Commission:{" "}
                    {contact.brokerCommissionType === "per_bag"
                      ? `Rs.${parseFloat(contact.brokerCommissionValue).toFixed(2)}/bag`
                      : `${parseFloat(contact.brokerCommissionValue).toFixed(2)}%`}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmId(contact.id);
                }}
                className="text-[#ADB5BD] hover:text-[#E74C3C] transition-colors p-2 ml-2 shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center"
                title="Delete contact"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">Delete Contact</h3>
            <p className="text-[#6C757D] mb-6">
              Are you sure you want to delete this contact? This action cannot be undone.
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

      {/* Contact Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-[#2C3E50] mb-4">
                {editingId ? "Edit Contact" : "Add Contact"}
              </h2>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="Contact name"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-2">
                    Type
                  </label>
                  <div className="flex gap-2">
                    {CONTACT_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, type: t })}
                        className={cn(
                          "flex-1 px-3 py-3 min-h-[48px] rounded-xl text-base font-medium border transition-colors",
                          form.type === t
                            ? "border-[#1B4F72] bg-[#1B4F72] text-white"
                            : "border-[#DEE2E6] text-[#6C757D] hover:border-[#ADB5BD]"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Phone <span className="text-[#ADB5BD] font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="Phone number"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    City <span className="text-[#ADB5BD] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent"
                    placeholder="City"
                  />
                </div>

                {/* Broker Commission Section */}
                {form.type === "Broker" && (
                  <div className="bg-[#FDEBD0] border border-[#E67E22] rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-[#E67E22]">Broker Commission</h4>

                    <div>
                      <label className="block text-sm font-medium text-[#2C3E50] mb-2">
                        Commission Type
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, brokerCommissionType: "per_bag" })
                          }
                          className={cn(
                            "flex-1 px-3 py-3 min-h-[48px] rounded-xl text-base font-medium border transition-colors",
                            form.brokerCommissionType === "per_bag"
                              ? "border-[#E67E22] bg-[#E67E22] text-white"
                              : "border-[#DEE2E6] text-[#6C757D] hover:border-[#ADB5BD]"
                          )}
                        >
                          Per Bag
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, brokerCommissionType: "percentage" })
                          }
                          className={cn(
                            "flex-1 px-3 py-3 min-h-[48px] rounded-xl text-base font-medium border transition-colors",
                            form.brokerCommissionType === "percentage"
                              ? "border-[#E67E22] bg-[#E67E22] text-white"
                              : "border-[#DEE2E6] text-[#6C757D] hover:border-[#ADB5BD]"
                          )}
                        >
                          Percentage
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                        Commission Value{" "}
                        <span className="text-[#6C757D]">
                          ({form.brokerCommissionType === "per_bag" ? "Rs./bag" : "%"})
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.brokerCommissionValue}
                        onChange={(e) =>
                          setForm({ ...form, brokerCommissionValue: e.target.value })
                        }
                        className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#E67E22] focus:border-transparent"
                        placeholder={
                          form.brokerCommissionType === "per_bag" ? "e.g. 5.00" : "e.g. 2.5"
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1.5">
                    Notes <span className="text-[#ADB5BD] font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-3 min-h-[48px] border border-[#DEE2E6] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:border-transparent resize-none"
                    placeholder="Optional notes..."
                  />
                </div>
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
                  disabled={!form.name || isSaving}
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
