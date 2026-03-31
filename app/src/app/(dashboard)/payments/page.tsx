"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

export default function PaymentsPage() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: paymentsList, isLoading } = trpc.payments.list.useQuery();

  const deleteMutation = trpc.payments.delete.useMutation({
    onSuccess: () => {
      utils.payments.list.invalidate();
      setDeleteConfirmId(null);
      toast.success("Payment deleted");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete payment");
    },
  });

  const directionBadge = (direction: string) => {
    if (direction === "Paid") {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-[#FADBD8] text-[#922B21] border-[#E74C3C]">
          Paid
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-[#D5F5E3] text-[#1E8449] border-[#27AE60]">
        Received
      </span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Payments</h1>
        <Link
          href="/payments/new"
          className="inline-flex items-center min-h-[48px] bg-[#1B4F72] text-white px-4 py-3 rounded-xl text-base font-semibold hover:bg-[#154360] transition-colors"
        >
          + Record Payment
        </Link>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="h-4 bg-gray-200 rounded w-32" />
                <div className="h-6 bg-gray-200 rounded-full w-16" />
                <div className="h-6 bg-gray-200 rounded-full w-14" />
              </div>
              <div className="flex gap-4">
                <div className="h-3 bg-gray-200 rounded w-20" />
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-5 bg-gray-200 rounded w-12" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!paymentsList || paymentsList.length === 0) && (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#ADB5BD] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
          <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">No payments yet</h3>
          <p className="text-[#6C757D] mb-6 text-sm">
            Record payments to mills and collections from buyers to keep your balances up to date.
          </p>
          <Link
            href="/payments/new"
            className="inline-flex items-center min-h-[48px] px-6 py-3 bg-[#1B4F72] text-white text-base font-semibold rounded-xl hover:bg-[#154360] transition-colors"
          >
            + Record First Payment
          </Link>
        </div>
      )}

      {/* Payment Cards */}
      <div className="space-y-3">
        {(paymentsList ?? []).map((payment) => (
          <div
            key={payment.id}
            className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-[#2C3E50] truncate">
                    {payment.partyName}
                  </h3>
                  {directionBadge(payment.direction)}
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold border",
                      payment.partyType === "Mill"
                        ? "bg-[#D6EAF8] text-[#1B4F72] border-[#2980B9]"
                        : payment.partyType === "Buyer"
                          ? "bg-[#D5F5E3] text-[#1E8449] border-[#27AE60]"
                          : "bg-[#FDEBD0] text-[#A04000] border-[#E67E22]"
                    )}
                  >
                    {payment.partyType}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6C757D] mt-1">
                  <span>{formatDate(payment.date)}</span>
                  <span className="font-bold text-[#2C3E50]">
                    {formatIndianCurrency(payment.amount)}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-[#F8F9FA] text-[#6C757D] text-xs font-medium border border-[#DEE2E6]">
                    {payment.mode}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#6C757D] mt-1">
                  {payment.againstTxnId && (
                    <span>Against: {payment.againstTxnId}</span>
                  )}
                  {payment.reference && (
                    <span>Ref: {payment.reference}</span>
                  )}
                </div>
                {payment.notes && (
                  <p className="text-xs text-[#ADB5BD] mt-1">{payment.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <Link href={`/payments/new?edit=${payment.id}`} className="p-2 text-gray-400 hover:text-blue-600 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center" title="Edit">
                  <Pencil size={18} />
                </Link>
              <button
                onClick={() => setDeleteConfirmId(payment.id)}
                className="text-[#ADB5BD] hover:text-[#E74C3C] transition-colors p-2 shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center"
                title="Delete payment"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
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
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
              Delete Payment
            </h3>
            <p className="text-[#6C757D] mb-6">
              Are you sure you want to delete this payment? This action cannot
              be undone.
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
    </div>
  );
}
