"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronRight, ChevronLeft, Sparkles, X,
  LayoutDashboard, ShoppingCart, TrendingUp, CreditCard, BookOpen, Users,
  Upload, FileCheck, Download,
} from "lucide-react";

// ── Tour Steps ─────────────────────────────────────────────────────────────

interface TourStep {
  page: string;
  icon: typeof LayoutDashboard;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    page: "/",
    icon: LayoutDashboard,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50",
    title: "Your Dashboard",
    description:
      "Your business at a glance — CC position, where your money is, profit margins, and inventory. Every number has a (?) icon to explain how it's calculated.",
  },
  {
    page: "/purchases",
    icon: ShoppingCart,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-50",
    title: "Purchases",
    description:
      "Record yarn purchases here. Tap '+ New Purchase' — fill product, supplier, qty, rate. GST & totals auto-calculate. Under 60 seconds.",
  },
  {
    page: "/sales",
    icon: TrendingUp,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-50",
    title: "Sales",
    description:
      "Record sales to buyers. The system calculates your margin using weighted average cost. Instantly see if you're making money on each deal.",
  },
  {
    page: "/payments",
    icon: CreditCard,
    iconColor: "text-violet-500",
    iconBg: "bg-violet-50",
    title: "Payments",
    description:
      "Track all money — paid to mills or received from buyers. Link payments to specific transactions so balances update automatically.",
  },
  {
    page: "/ledger",
    icon: BookOpen,
    iconColor: "text-rose-500",
    iconBg: "bg-rose-50",
    title: "Ledger",
    description:
      "Party-wise balances — who owes you, who you owe, and for how many days. Tap any party to see their full history.",
  },
  {
    page: "/contacts",
    icon: Users,
    iconColor: "text-teal-500",
    iconBg: "bg-teal-50",
    title: "Contacts & Products",
    description:
      "Set up mills, buyers, brokers (with commission), and transporters. Products are in the 'Products' page. Set these up first — they power all dropdowns.",
  },
  {
    page: "/import",
    icon: Upload,
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-50",
    title: "Import Data",
    description:
      "Bulk import contacts, products, purchases, or sales from Excel. Download a template, fill it in, and upload — the system validates every row before importing.",
  },
  {
    page: "/settings",
    icon: Download,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-50",
    title: "Export Data",
    description:
      "Download all your data as an Excel file from Settings. Separate sheets for contacts, products, purchases, sales, payments, and CC ledger. Great for backups or sharing with your CA.",
  },
  {
    page: "/recon",
    icon: FileCheck,
    iconColor: "text-cyan-500",
    iconBg: "bg-cyan-50",
    title: "Tally Reconciliation",
    description:
      "Match your data with Tally. Upload your Tally export, and the system auto-matches party names and compares balances. Instantly spot mismatches and variances.",
  },
  {
    page: "/",
    icon: Sparkles,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50",
    title: "You're All Set!",
    description:
      "Daily flow: record Purchase → record Sale → record Payment. Dashboard updates automatically. Start by adding contacts & products!",
  },
];

// ── Storage ────────────────────────────────────────────────────────────────

const TOUR_STORAGE_KEY = "syt_tour_completed";

function hasTourBeenCompleted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
}

function markTourCompleted() {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOUR_STORAGE_KEY, "true");
}

// ── Component ──────────────────────────────────────────────────────────────

export function GuidedTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [navigating, setNavigating] = useState(false);

  // Should the tour show?
  useEffect(() => {
    const tourFromUrl = searchParams.get("tour") === "1";
    const isDemoUser = session?.user?.email === "demo@syt.app";

    if (tourFromUrl || isDemoUser || !hasTourBeenCompleted()) {
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, [searchParams, session?.user?.email]);

  // After navigation completes, clear navigating flag
  useEffect(() => {
    if (navigating && pathname === TOUR_STEPS[step].page) {
      const timer = setTimeout(() => setNavigating(false), 250);
      return () => clearTimeout(timer);
    }
  }, [pathname, navigating, step]);

  const navigateToStep = (idx: number) => {
    const target = TOUR_STEPS[idx].page;
    setStep(idx);
    if (pathname !== target) {
      setNavigating(true);
      router.push(target);
    }
  };

  const finish = (navigate = true) => {
    setActive(false);
    const isDemoUser = session?.user?.email === "demo@syt.app";
    if (!isDemoUser) markTourCompleted();
    if (navigate && pathname !== "/") router.push("/");
  };

  if (!active || navigating) return null;

  const cur = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;
  const Icon = cur.icon;

  return (
    <div
      className="fixed left-2 right-2 md:left-auto md:right-4 md:w-[400px] z-[100] animate-slide-up"
      style={{
        /* Mobile: sit above bottom nav (h-16=64px) + safe area + 8px gap */
        bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)",
      }}
    >
      {/* Desktop override: fixed 16px from bottom */}
      <style>{`
        @media (min-width: 768px) {
          .tour-card-wrapper { bottom: 16px !important; }
        }
      `}</style>

      <div
        className="tour-card-wrapper bg-white rounded-2xl border border-gray-200 overflow-hidden"
        style={{
          boxShadow: "0 -4px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 flex">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`flex-1 transition-all duration-500 ${
                i <= step ? "bg-blue-500" : ""
              }`}
            />
          ))}
        </div>

        <div className="p-4">
          {/* Header: icon + title + close */}
          <div className="flex items-center gap-3 mb-2.5">
            <div
              className={`w-9 h-9 rounded-xl ${cur.iconBg} flex items-center justify-center flex-shrink-0`}
            >
              <Icon size={18} className={cur.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
                {cur.title}
              </h3>
              <p className="text-[11px] text-gray-400 font-medium">
                {step + 1} of {TOUR_STEPS.length}
              </p>
            </div>
            <button
              onClick={() => finish()}
              className="p-2 -mr-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Close tour"
            >
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Description — full width on mobile, no left indent */}
          <p className="text-[13px] text-gray-600 leading-relaxed mb-4">
            {cur.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            {!isLast ? (
              <button
                onClick={() => finish()}
                className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors py-1"
              >
                Skip tour
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={() => navigateToStep(step - 1)}
                  className="flex items-center gap-0.5 px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 rounded-xl transition-colors min-h-[40px]"
                >
                  <ChevronLeft size={14} /> Back
                </button>
              )}
              <button
                onClick={() =>
                  isLast ? finish() : navigateToStep(step + 1)
                }
                className="flex items-center gap-0.5 px-5 py-2 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors min-h-[40px]"
              >
                {isLast
                  ? "Get Started"
                  : isFirst
                  ? "Start Tour"
                  : "Next"}
                {!isLast && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
