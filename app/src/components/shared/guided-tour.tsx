"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

// ── Tour Step Definition ───────────────────────────────────────────────────

interface TourStep {
  /** data-tour attribute value to target, or null for centered overlay */
  target: string | null;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "Welcome to SYT!",
    description:
      "Let's take a quick 2-minute tour. We'll show you how to track your yarn business — purchases, sales, margins, and more.",
  },
  {
    target: "tour-cc-card",
    title: "CC Account",
    description:
      "Your Cash Credit position at a glance. See how much you've used, what's available, and the interest being charged. The bar turns red when you're using too much.",
    position: "bottom",
  },
  {
    target: "tour-money-card",
    title: "Where Is My Money?",
    description:
      "The big picture — money stuck in stock, what buyers owe you, and what you owe mills. Tap 'View Full Ledger' to see party-wise details.",
    position: "bottom",
  },
  {
    target: "tour-margins-card",
    title: "Your Profit",
    description:
      "Your real margins after all costs — COGS, transport, broker commission, and CC interest. Green means you're making money!",
    position: "top",
  },
  {
    target: "tour-inventory-card",
    title: "Stock in Hand",
    description:
      "How much yarn is sitting in your godown, product-wise. Bags and kilos at a glance.",
    position: "top",
  },
  {
    target: "tour-nav",
    title: "Navigate Your Business",
    description:
      "Use Buy, Sell, and Pay to record daily transactions. Each entry takes under 60 seconds. The 'More' menu has your ledger, contacts, and settings.",
    position: "top",
  },
  {
    target: null,
    title: "You're All Set!",
    description:
      "That's the tour! Start by recording a purchase — tap 'Buy' in the navigation below. Every number on the dashboard has a (?) icon that explains what it means.",
  },
];

// ── Tour Storage ───────────────────────────────────────────────────────────

const TOUR_STORAGE_KEY = "syt_tour_completed";

function hasTourBeenCompleted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
}

function markTourCompleted() {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOUR_STORAGE_KEY, "true");
}

// ── Spotlight + Tooltip Component ──────────────────────────────────────────

function getElementRect(target: string): DOMRect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function scrollToElement(target: string) {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── Main Tour Component ────────────────────────────────────────────────────

interface GuidedTourProps {
  /** If true, always show the tour (for demo user) */
  forceShow?: boolean;
  /** Called when tour finishes or is skipped */
  onComplete?: () => void;
}

export function GuidedTour({ forceShow = false, onComplete }: GuidedTourProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    spotTop: number;
    spotLeft: number;
    spotWidth: number;
    spotHeight: number;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Decide whether to show tour
  useEffect(() => {
    if (forceShow) {
      // Small delay to let dashboard render
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
    if (!hasTourBeenCompleted()) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  // Position tooltip when step changes
  const positionTooltip = useCallback(() => {
    const currentStep = TOUR_STEPS[step];
    if (!currentStep?.target) {
      setTooltipPos(null);
      return;
    }

    const rect = getElementRect(currentStep.target);
    if (!rect) {
      setTooltipPos(null);
      return;
    }

    const padding = 8;
    const spotTop = rect.top - padding + window.scrollY;
    const spotLeft = rect.left - padding;
    const spotWidth = rect.width + padding * 2;
    const spotHeight = rect.height + padding * 2;

    // Calculate tooltip position
    const tooltipWidth = Math.min(340, window.innerWidth - 32);
    const pos = currentStep.position || "bottom";
    let top = 0;
    let left = 0;

    if (pos === "bottom") {
      top = spotTop + spotHeight + 12;
      left = spotLeft + spotWidth / 2 - tooltipWidth / 2;
    } else if (pos === "top") {
      // We'll adjust after render once we know tooltip height
      top = spotTop - 12; // Will be adjusted
      left = spotLeft + spotWidth / 2 - tooltipWidth / 2;
    } else if (pos === "right") {
      top = spotTop + spotHeight / 2;
      left = spotLeft + spotWidth + 12;
    } else {
      top = spotTop + spotHeight / 2;
      left = spotLeft - tooltipWidth - 12;
    }

    // Keep within viewport horizontally
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

    setTooltipPos({ top, left, spotTop, spotLeft, spotWidth, spotHeight });
  }, [step]);

  // Adjust for "top" position after tooltip renders
  useEffect(() => {
    if (!tooltipPos || !tooltipRef.current) return;
    const currentStep = TOUR_STEPS[step];
    if (currentStep?.position === "top") {
      const tooltipHeight = tooltipRef.current.offsetHeight;
      setTooltipPos((prev) =>
        prev ? { ...prev, top: prev.spotTop - tooltipHeight - 12 } : null
      );
    }
  }, [tooltipPos?.spotTop, step]);

  useEffect(() => {
    if (!active) return;
    const currentStep = TOUR_STEPS[step];
    if (currentStep?.target) {
      scrollToElement(currentStep.target);
      // Wait for scroll, then position
      const timer = setTimeout(positionTooltip, 400);
      return () => clearTimeout(timer);
    } else {
      setTooltipPos(null);
    }
  }, [active, step, positionTooltip]);

  // Reposition on resize/scroll
  useEffect(() => {
    if (!active) return;
    const handler = () => positionTooltip();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [active, positionTooltip]);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleFinish = () => {
    setActive(false);
    if (!forceShow) markTourCompleted();
    onComplete?.();
  };

  const handleSkip = () => {
    setActive(false);
    if (!forceShow) markTourCompleted();
    onComplete?.();
  };

  if (!active) return null;

  const currentStep = TOUR_STEPS[step];
  const isFirstStep = step === 0;
  const isLastStep = step === TOUR_STEPS.length - 1;
  const isCentered = !currentStep.target;

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "auto" }}>
      {/* Overlay */}
      {isCentered ? (
        // Full overlay for centered steps
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      ) : tooltipPos ? (
        // Spotlight overlay using box-shadow
        <div
          className="absolute inset-0"
          style={{ pointerEvents: "auto" }}
        >
          <div
            className="absolute rounded-2xl transition-all duration-300"
            style={{
              top: tooltipPos.spotTop,
              left: tooltipPos.spotLeft,
              width: tooltipPos.spotWidth,
              height: tooltipPos.spotHeight,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      )}

      {/* Tooltip */}
      {isCentered ? (
        // Centered card
        <div className="absolute inset-0 flex items-center justify-center p-6" style={{ zIndex: 2 }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
            {/* Header with icon */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Sparkles size={20} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{currentStep.title}</h3>
                <p className="text-xs text-gray-400">
                  Step {step + 1} of {TOUR_STEPS.length}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              {currentStep.description}
            </p>

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
                  className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors"
                >
                  {isLastStep ? "Get Started" : isFirstStep ? "Start Tour" : "Next"}
                  {!isLastStep && <ChevronRight size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : tooltipPos ? (
        // Positioned tooltip
        <div
          ref={tooltipRef}
          className="absolute animate-fade-in"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            zIndex: 2,
            width: Math.min(340, window.innerWidth - 32),
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-5 border border-gray-100">
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-3 right-3 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={14} className="text-gray-400" />
            </button>

            {/* Step counter */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === step ? "w-6 bg-blue-500" : i < step ? "w-1.5 bg-blue-200" : "w-1.5 bg-gray-200"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-gray-400 ml-auto">
                {step + 1}/{TOUR_STEPS.length}
              </span>
            </div>

            <h3 className="text-base font-bold text-gray-900 mb-1.5">{currentStep.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              {currentStep.description}
            </p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Skip
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={handlePrev}
                    className="flex items-center gap-0.5 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={12} /> Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-0.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {isLastStep ? "Done" : "Next"}
                  {!isLastStep && <ChevronRight size={12} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
