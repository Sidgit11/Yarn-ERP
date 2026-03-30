"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronRight, ChevronLeft, Sparkles, X,
  LayoutDashboard, ShoppingCart, TrendingUp, CreditCard, BookOpen, Users,
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
      "Record sales to buyers. The system calculates your margin on each sale using weighted average cost from purchases. Instantly see if you're making money.",
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
      "Set up your mills, buyers, brokers (with commission), and transporters here. Products live in the 'Products' page. Set these up first — they power all dropdowns.",
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
    <>
      {/*
        Bottom card — sits above the mobile nav (bottom-20 = 80px),
        or at the bottom on desktop. No overlay, page is fully visible.
      */}
      <div className="fixed bottom-20 md:bottom-4 left-3 right-3 md:left-auto md:right-4 md:w-[400px] z-[100] animate-slide-up">
        <div
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
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

          <div className="px-4 pt-3.5 pb-4">
            {/* Top row: icon + title + step + close */}
            <div className="flex items-start gap-3 mb-2">
              <div
                className={`w-9 h-9 rounded-xl ${cur.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}
              >
                <Icon size={18} className={cur.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
                    {cur.title}
                  </h3>
                  <button
                    onClick={() => finish()}
                    className="p-1 -mr-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                  >
                    <X size={14} className="text-gray-400" />
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">
                  {step + 1} of {TOUR_STEPS.length}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-[13px] text-gray-600 leading-relaxed mb-3 ml-12">
              {cur.description}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between ml-12">
              {!isLast ? (
                <button
                  onClick={() => finish()}
                  className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Skip tour
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1.5">
                {!isFirst && (
                  <button
                    onClick={() => navigateToStep(step - 1)}
                    className="flex items-center gap-0.5 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={12} /> Back
                  </button>
                )}
                <button
                  onClick={() =>
                    isLast ? finish() : navigateToStep(step + 1)
                  }
                  className="flex items-center gap-0.5 px-4 py-1.5 text-[12px] font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {isLast
                    ? "Get Started"
                    : isFirst
                    ? "Start Tour"
                    : "Next"}
                  {!isLast && <ChevronRight size={12} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
