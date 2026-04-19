// Yarn ERP Dashboard v2
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency } from "@/lib/utils";
import { MetricExplainer } from "@/components/shared/metric-explainer";
import {
  TrendingUp, TrendingDown, ArrowRight, ChevronDown, ChevronUp,
  Landmark, Wallet, Receipt, BarChart3, Package, Activity, AlertTriangle,
} from "lucide-react";
import Link from "next/link";

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 rounded-xl" />
          <div className="h-4 bg-gray-100 rounded w-32" />
        </div>
        <div className="h-8 bg-gray-100 rounded w-1/2 mt-2" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

// ── Shared metric components ─────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  explainer,
  isBold,
  isHero,
  isNegative,
  suffix,
}: {
  label: string;
  value: string;
  explainer?: { title: string; description: string; formula?: string; action?: string };
  isBold?: boolean;
  isHero?: boolean;
  isNegative?: boolean;
  suffix?: string;
}) {
  return (
    <div className={`flex items-start justify-between py-1.5 gap-3 ${isBold || isHero ? "font-semibold" : ""}`}>
      <span className={`text-[13px] ${isBold || isHero ? "text-gray-800" : "text-gray-500"}`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className={`whitespace-nowrap tabular-nums ${
            isHero ? "text-[32px] font-bold leading-10 tracking-tight" : "text-[13px] font-medium"
          } ${
            isNegative ? "text-red-600" : isBold || isHero ? "text-gray-900" : "text-gray-700"
          }`}
        >
          {value}
          {suffix && <span className="text-xs text-gray-400 ml-1 font-normal">{suffix}</span>}
        </span>
        {explainer && <MetricExplainer {...explainer} />}
      </div>
    </div>
  );
}

function Separator() {
  return <div className="border-t border-gray-100 my-1.5" />;
}

function HeavySeparator() {
  return <div className="border-t-2 border-gray-200 my-2" />;
}

// ── Card shell with icon+title pattern ───────────────────────────────────────

type CardTheme = {
  accent: string;
  accentText: string;
  iconBg: string;
};

const CARD_CONFIG: Record<string, { icon: typeof Landmark; theme: CardTheme }> = {
  cc: {
    icon: Landmark,
    theme: { accent: "bg-red-500", accentText: "text-red-600", iconBg: "bg-red-50" },
  },
  money: {
    icon: Wallet,
    theme: { accent: "bg-blue-500", accentText: "text-blue-600", iconBg: "bg-blue-50" },
  },
  gst: {
    icon: Receipt,
    theme: { accent: "bg-teal-500", accentText: "text-teal-600", iconBg: "bg-teal-50" },
  },
  margins: {
    icon: BarChart3,
    theme: { accent: "bg-green-500", accentText: "text-green-600", iconBg: "bg-green-50" },
  },
  inventory: {
    icon: Package,
    theme: { accent: "bg-violet-500", accentText: "text-violet-600", iconBg: "bg-violet-50" },
  },
  stats: {
    icon: Activity,
    theme: { accent: "bg-orange-500", accentText: "text-orange-600", iconBg: "bg-orange-50" },
  },
};

function DashboardCard({
  title,
  cardKey,
  children,
  className = "",
}: {
  title: string;
  cardKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const config = CARD_CONFIG[cardKey];
  const Icon = config.icon;

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 overflow-hidden card-hover ${className}`}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* Accent stripe */}
      <div className={`h-1 ${config.theme.accent}`} />

      {/* Header: icon + title */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-5 pt-4 pb-2 flex items-center justify-between cursor-pointer md:cursor-default"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${config.theme.iconBg} flex items-center justify-center`}>
            <Icon size={18} className={config.theme.accentText} />
          </div>
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">{title}</h2>
        </div>
        <span className="text-gray-400 md:hidden">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </button>

      {/* Body */}
      {!collapsed && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data, isLoading } = trpc.dashboard.getMetrics.useQuery();

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-xl font-bold text-gray-900 mb-5">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { cc, money, gst, margins, inventory, stats } = data;

  // Empty state
  const isEmpty =
    stats.totalPurchases === 0 &&
    stats.totalSales === 0 &&
    cc.outstanding === 0 &&
    inventory.length === 0;

  if (isEmpty) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-xl font-bold text-gray-900 mb-5">Dashboard</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Activity size={28} className="text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome to TradeTexPro!</h2>
          <p className="text-gray-500 mb-4 max-w-md mx-auto">
            Your dashboard will come alive once you start recording transactions.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link href="/products" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-700 font-medium transition-colors">
              <Package size={14} /> Add Products
            </Link>
            <Link href="/contacts" className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-700 font-medium transition-colors">
              Add Contacts
            </Link>
            <Link href="/purchases/new" className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors">
              Record Purchase <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // CC utilization
  const ccBarColor =
    cc.utilizationPct > 80 ? "bg-red-500" : cc.utilizationPct > 50 ? "bg-amber-500" : "bg-emerald-500";
  const ccCardClass = cc.utilizationPct > 80 ? "animate-pulse-border border-2 !border-red-300" : "";

  const hasNegativeInventory = data.negativeInventory && data.negativeInventory.length > 0;

  return (
    <div className="animate-fade-in">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Dashboard</h1>

      {/* Data issue callout */}
      {hasNegativeInventory && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800 mb-1">Data issue: Negative inventory</h3>
              <p className="text-xs text-red-600 mb-2">
                The following products show more sold than purchased. This usually means a purchase entry is missing or a sale was recorded against the wrong product.
              </p>
              <div className="space-y-1">
                {data.negativeInventory.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-red-700">{item.productName}</span>
                    <span className="text-red-500">{item.bagsInHand} bags / {item.kgInHand} kg</span>
                  </div>
                ))}
              </div>
              <Link href="/purchases/new" className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 mt-2">
                Add missing purchase <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Card 1: CC Account Position */}
        <DashboardCard title="CC Account" cardKey="cc" className={ccCardClass}>
          <MetricRow
            label="CC used"
            value={formatIndianCurrency(cc.outstanding)}
            isHero
            explainer={{
              title: "CC Outstanding",
              description: "Total drawn from PNB CC account minus repayments.",
              formula: "Sum of draws - Sum of repayments",
              action: "Check CC Ledger for any missing repayment entries.",
            }}
          />
          {/* Progress bar */}
          <div className="my-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Utilisation</span>
              <span className="font-medium text-gray-600">{cc.utilizationPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${ccBarColor}`}
                style={{ width: `${Math.min(cc.utilizationPct, 100)}%` }}
              />
            </div>
          </div>
          <MetricRow label="Available" value={formatIndianCurrency(cc.available)}
            explainer={{ title: "Available", description: "CC Limit minus Outstanding.", formula: "CC Limit - Outstanding" }} />
          <MetricRow label="Limit" value={formatIndianCurrency(cc.limit)}
            explainer={{ title: "CC Limit", description: "Maximum CC draw amount. Update in Settings.", action: "Go to Settings to update." }} />
          <Separator />
          <MetricRow label="Interest (calc)" value={formatIndianCurrency(cc.calculatedInterest)}
            explainer={{ title: "Interest (calculated)", description: "Day-by-day calculation based on CC balance.", formula: "Sum of (daily balance x rate / 365)" }} />
          <MetricRow label="Interest (actual)" value={formatIndianCurrency(cc.actualInterest)}
            explainer={{ title: "Interest (actual)", description: "What PNB charged — enter monthly in Settings.", action: "Update in Settings from bank statement." }} />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-gray-500">Difference</span>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                {cc.difference > 0 ? (
                  <TrendingUp size={13} className="text-red-500" />
                ) : cc.difference < 0 ? (
                  <TrendingDown size={13} className="text-emerald-500" />
                ) : null}
                <span className={`text-[13px] font-medium tabular-nums ${cc.difference > 0 ? "text-red-600" : cc.difference < 0 ? "text-emerald-600" : "text-gray-500"}`}>
                  {formatIndianCurrency(Math.abs(cc.difference))}
                </span>
              </div>
              <MetricExplainer title="Interest Difference" description="Gap between calculated and actual interest." formula="Calculated - Actual" />
            </div>
          </div>
          {/* Money Trail */}
          {cc.outstanding > 0 && cc.moneyTrail && (() => {
            const trail = cc.moneyTrail;
            const items = [
              { label: "Stock in hand", value: trail.stockAtCost, color: "bg-violet-500" },
              { label: "Awaiting collection", value: trail.soldAtCost, color: "bg-blue-500" },
              { label: "GST paid (ITC)", value: trail.gstPaid, color: "bg-teal-500" },
              { label: "Transport", value: trail.transport, color: "bg-orange-500" },
              { label: "Advance to mills", value: trail.overpaidToMills, color: "bg-gray-400" },
            ].filter((i) => i.value > 0);
            if (items.length === 0) return null;
            return (
              <>
                <Separator />
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-1 mb-1.5">
                  Where is this money?
                </p>
                <div className="space-y-1">
                  {items.map((item) => {
                    const pct = Math.round((item.value / cc.outstanding) * 100);
                    return (
                      <div key={item.label} className="flex items-center justify-between text-[12px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0`} />
                          <span className="text-gray-500">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 tabular-nums flex-shrink-0">
                          <span className="text-gray-700 font-medium">{formatIndianCurrency(item.value)}</span>
                          <span className="text-gray-400 text-[11px]">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </DashboardCard>

        {/* Card 2: Where Is My Money? */}
        <DashboardCard title="Where Is My Money?" cardKey="money">
          <MetricRow label="Stock in Hand" value={formatIndianCurrency(money.cashInInventory)} isHero
            explainer={{ title: "Stock in Hand", description: "Value of unsold yarn sitting in your godown, at purchase cost.", formula: "Total Purchase Base - Cost of Goods Sold" }} />
          <Separator />
          <MetricRow label="Receivables" value={formatIndianCurrency(money.totalReceivables)}
            explainer={{ title: "Receivables", description: "Total amount buyers owe you (incl GST). Check Ledger to see who owes what.", formula: "Sale Total (incl GST) - Received - Payments" }} />
          {money.totalPayables > 0 && (
            <>
              <MetricRow label="Payables" value={formatIndianCurrency(money.totalPayables)} isNegative isBold
                explainer={{ title: "Total Payables", description: "Total amount you owe across mills, brokers, and transporters.", formula: "Mill payable + Broker pending + Transporter pending" }} />
              {money.millPayables > 0 && (
                <div className="flex items-center justify-between py-1 pl-4">
                  <span className="text-[12px] text-gray-400">Mills</span>
                  <span className="text-[12px] text-gray-600 tabular-nums">{formatIndianCurrency(money.millPayables)}</span>
                </div>
              )}
              {money.brokerPending > 0 && (
                <div className="flex items-center justify-between py-1 pl-4">
                  <span className="text-[12px] text-gray-400">Brokers</span>
                  <span className="text-[12px] text-gray-600 tabular-nums">{formatIndianCurrency(money.brokerPending)}</span>
                </div>
              )}
              {money.transporterPending > 0 && (
                <div className="flex items-center justify-between py-1 pl-4">
                  <span className="text-[12px] text-gray-400">Transporters</span>
                  <span className="text-[12px] text-gray-600 tabular-nums">{formatIndianCurrency(money.transporterPending)}</span>
                </div>
              )}
            </>
          )}
          <Separator />
          <MetricRow label="Expenses" value={formatIndianCurrency(money.expenses)}
            explainer={{ title: "Expenses", description: "Total transport + broker commission spent across all transactions. This money is spent and non-recoverable.", formula: "Transport (purchase + sale) + Broker Commission" }} />
          {money.gstNet > 0 && (
            <MetricRow label="GST with Govt (ITC)" value={formatIndianCurrency(money.gstNet)}
              explainer={{ title: "GST with Govt", description: "Net GST you've paid more on purchases than collected on sales. This is refundable as Input Tax Credit.", formula: "Purchase GST - Sale GST" }} />
          )}
          {money.unrealizedProfit > 0 && (
            <>
              <Separator />
              <MetricRow label="Unrealized Profit" value={formatIndianCurrency(money.unrealizedProfit)} isBold
                explainer={{ title: "Unrealized Profit", description: "Your gross trading margin. This becomes real cash only when buyers pay you.", formula: "Sale Revenue - COGS - Transport - Broker Commission" }} />
            </>
          )}
          <div className="pt-3">
            <Link href="/ledger"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
              View Full Ledger <ArrowRight size={14} />
            </Link>
          </div>
        </DashboardCard>

        {/* Card 3: GST Position */}
        <DashboardCard title="GST Position" cardKey="gst">
          <MetricRow label="Output GST" value={formatIndianCurrency(gst.outputGst)}
            explainer={{ title: "Output GST", description: "GST collected from buyers.", formula: "Sum of (sale base x GST%)" }} />
          <MetricRow label="Input GST" value={formatIndianCurrency(gst.inputGst)}
            explainer={{ title: "Input GST", description: "GST paid to mills.", formula: "Sum of (purchase base x GST%)" }} />
          <HeavySeparator />
          <MetricRow label="Net GST Payable" value={formatIndianCurrency(gst.netPayable)} isNegative={gst.netPayable > 0} isHero
            explainer={{ title: "Net GST Payable", description: "Positive = owe govt. Negative = ITC credit.", formula: "Output GST - Input GST" }} />
          <MetricRow label="ITC Available" value={formatIndianCurrency(gst.itcAvailable)}
            explainer={{ title: "ITC Available", description: "Carry-forward credit when Input > Output.", formula: "Max(0, Input GST - Output GST)" }} />
        </DashboardCard>

        {/* Card 4: Your Profit */}
        <DashboardCard title="Your Profit" cardKey="margins">
          <MetricRow label="Revenue (excl GST)" value={formatIndianCurrency(margins.revenue)}
            explainer={{ title: "Revenue", description: "Total sales before GST.", formula: "Sum of (qty x rate)" }} />
          <MetricRow label="Cost of Goods" value={formatIndianCurrency(margins.cogs)}
            explainer={{ title: "COGS", description: "Purchase cost of yarn sold (weighted avg)." }} />
          <MetricRow label="Transport" value={formatIndianCurrency(margins.transport)} />
          <MetricRow label="Broker Commission" value={formatIndianCurrency(margins.brokerCommission)} />
          <HeavySeparator />
          <div className="flex items-center justify-between py-1.5 font-semibold">
            <span className="text-[13px] text-gray-800">GROSS MARGIN</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[32px] font-bold leading-10 tracking-tight tabular-nums ${margins.grossMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatIndianCurrency(margins.grossMargin)}
              </span>
              <span className="text-xs text-gray-400 font-normal">({margins.grossMarginPct}%)</span>
              <MetricExplainer title="Gross Margin" description="Trading profit before CC interest." formula="Revenue - COGS - Transport - Commission" />
            </div>
          </div>
          <MetricRow label="CC Interest (actual)" value={formatIndianCurrency(margins.ccInterest)} />
          <Separator />
          <div className="flex items-center justify-between py-1.5 font-bold">
            <span className="text-[13px] text-gray-900">NET MARGIN</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[32px] font-bold leading-10 tracking-tight tabular-nums ${margins.netMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatIndianCurrency(margins.netMargin)}
              </span>
              <span className="text-xs text-gray-400 font-semibold">({margins.netMarginPct}%)</span>
              <MetricExplainer title="Net Margin" description="Your true bottom-line profit." formula="Gross Margin - CC Interest" />
            </div>
          </div>
        </DashboardCard>

        {/* Card 5: Stock in Hand */}
        <DashboardCard title="Stock in Hand" cardKey="inventory">
          {inventory.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No inventory in hand.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left py-1.5 font-medium">Product</th>
                    <th className="text-right py-1.5 font-medium">Bags</th>
                    <th className="text-right py-1.5 font-medium">Kg</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-50">
                      <td className="py-1.5 text-gray-700 text-[13px]">{item.productName}</td>
                      <td className="py-1.5 text-right text-gray-800 font-medium tabular-nums text-[13px]">{item.bagsInHand}</td>
                      <td className="py-1.5 text-right text-gray-800 font-medium tabular-nums text-[13px]">
                        {item.kgInHand.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td className="py-1.5 text-gray-800 text-[13px]">Total</td>
                    <td className="py-1.5 text-right text-gray-800 tabular-nums text-[13px]">
                      {inventory.reduce((s, i) => s + i.bagsInHand, 0)}
                    </td>
                    <td className="py-1.5 text-right text-gray-800 tabular-nums text-[13px]">
                      {inventory.reduce((s, i) => s + i.kgInHand, 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DashboardCard>

        {/* Card 6: Quick Stats */}
        <DashboardCard title="Quick Stats" cardKey="stats">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1">Total Purchases</p>
              <p className="text-[32px] font-bold text-gray-800 leading-10 tracking-tight tabular-nums">{stats.totalPurchases}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1">Pending Payments</p>
              <p className="text-[32px] font-bold text-orange-600 leading-10 tracking-tight tabular-nums">{stats.pendingPayments}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1">Total Sales</p>
              <p className="text-[32px] font-bold text-gray-800 leading-10 tracking-tight tabular-nums">{stats.totalSales}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1">Pending Collections</p>
              <p className="text-[32px] font-bold text-orange-600 leading-10 tracking-tight tabular-nums">{stats.pendingCollections}</p>
            </div>
            {stats.overdueCollections > 0 && (
              <>
                <div />
                <div>
                  <p className="text-xs text-red-500 font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Overdue
                  </p>
                  <p className="text-[32px] font-bold text-red-600 leading-10 tracking-tight tabular-nums">{stats.overdueCollections}</p>
                </div>
              </>
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
