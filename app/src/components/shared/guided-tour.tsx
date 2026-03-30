"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronRight, ChevronLeft, Sparkles,
  LayoutDashboard, ShoppingCart, TrendingUp, CreditCard, BookOpen, Users, X,
} from "lucide-react";

// ── Tour Steps — one per page ──────────────────────────────────────────────

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
      "This is your business command center. At a glance you can see your CC position, where your money is (stock, receivables, payables), your real profit margins, and inventory. Every number has a (?) icon — tap it to see how it's calculated.",
  },
  {
    page: "/purchases",
    icon: ShoppingCart,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-50",
    title: "Purchases — Record What You Buy",
    description:
      "Every time you buy yarn from a mill, record it here. Tap '+ New Purchase' to add one — just fill product, supplier, quantity, and rate. The system auto-calculates GST, totals, and balance due. Takes under 60 seconds.",
  },
  {
    page: "/sales",
    icon: TrendingUp,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-50",
    title: "Sales — Record What You Sell",
    description:
      "When you sell yarn to a buyer, record it here. The system automatically calculates your margin on each sale using weighted average cost from your purchases. You'll instantly see if you're making or losing money on each deal.",
  },
  {
    page: "/payments",
    icon: CreditCard,
    iconColor: "text-violet-500",
    iconBg: "bg-violet-50",
    title: "Payments — Track Money In & Out",
    description:
      "Record every payment — money you pay to mills and money you receive from buyers. Link payments to specific purchases or sales so balances update automatically. Supports NEFT, UPI, Cash, Cheque, and RTGS.",
  },
  {
    page: "/ledger",
    icon: BookOpen,
    iconColor: "text-rose-500",
    iconBg: "bg-rose-50",
    title: "Ledger — Who Owes What",
    description:
      "Your party-wise ledger shows the net balance for every mill, buyer, and broker. See how many days a payment has been pending. Tap any party to see their full transaction history.",
  },
  {
    page: "/contacts",
    icon: Users,
    iconColor: "text-teal-500",
    iconBg: "bg-teal-50",
    title: "Contacts & Products",
    description:
      "Add your mills, buyers, brokers, and transporters here. For brokers, set their commission (per bag or percentage). Your product catalog (yarn types) lives under 'Products' in the menu. Set these up first — they power all dropdowns.",
  },
  {
    page: "/",
    icon: Sparkles,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50",
    title: "You're All Set!",
    description:
      "That's it! The typical daily flow is: record a Purchase, record a Sale, record Payments. Your dashboard updates automatically. Start by adding your contacts and products, then record your first purchase.",
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

// ── Main Component ─────────────────────────────────────────────────────────

export function GuidedTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [navigating, setNavigating] = useState(false);

  // Determine if tour should show
  useEffect(() => {
    const tourFromUrl = searchParams.get("tour") === "1";
    const isDemoUser = session?.user?.email === "demo@syt.app";

    if (tourFromUrl || isDemoUser) {
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
    if (!hasTourBeenCompleted()) {
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, [searchParams, session?.user?.email]);

  // After navigation completes, stop the navigating state
  useEffect(() => {
    if (navigating && pathname === TOUR_STEPS[step].page) {
      const timer = setTimeout(() => setNavigating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, navigating, step]);

  const navigateToStep = (stepIndex: number) => {
    const targetPage = TOUR_STEPS[stepIndex].page;
    setStep(stepIndex);
    if (pathname !== targetPage) {
      setNavigating(true);
      router.push(targetPage);
    }
  };

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      navigateToStep(step + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      navigateToStep(step - 1);
    }
  };

  const handleFinish = () => {
    setActive(false);
    const isDemoUser = session?.user?.email === "demo@syt.app";
    if (!isDemoUser) markTourCompleted();
    // Navigate back to dashboard
    if (pathname !== "/") router.push("/");
  };

  const handleSkip = () => {
    setActive(false);
    const isDemoUser = session?.user?.email === "demo@syt.app";
    if (!isDemoUser) markTourCompleted();
    if (pathname !== "/") router.push("/");
  };

  if (!active || navigating) return null;

  const currentStep = TOUR_STEPS[step];
  const isFirstStep = step === 0;
  const isLastStep = step === TOUR_STEPS.length - 1;
  const Icon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Dimmed overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={handleSkip} />

      {/* Centered card */}
      <div className="absolute inset-0 flex items-center justify-center p-5" style={{ zIndex: 2 }}>
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-[380px] w-full overflow-hidden animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="h-1 bg-gray-100 flex">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`flex-1 transition-all duration-500 ${
                  i <= step ? "bg-blue-500" : "bg-gray-100"
                }`}
              />
            ))}
          </div>

          <div className="p-6">
            {/* Close */}
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={16} className="text-gray-400" />
            </button>

            {/* Icon + Step */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-11 h-11 rounded-xl ${currentStep.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={22} className={currentStep.iconColor} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 leading-tight">{currentStep.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Step {step + 1} of {TOUR_STEPS.length}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-[14px] text-gray-600 leading-relaxed mb-6">
              {currentStep.description}
            </p>

            {/* Page indicator pill */}
            {!isLastStep && (
              <div className="mb-5 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-full text-xs text-gray-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  You are on: {currentStep.page === "/" ? "Dashboard" : currentStep.page.replace("/", "").replace("-", " ").replace(/^\w/, c => c.toUpperCase())}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                {isLastStep ? "" : "Skip tour"}
              </button>
              <div className="flex items-center gap-2">
                {!isFirstStep && (
                  <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={14} /> Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-5 py-2.5 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors"
                >
                  {isLastStep ? "Get Started" : isFirstStep ? "Start Tour" : "Next"}
                  {!isLastStep && <ChevronRight size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
