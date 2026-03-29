"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatIndianCurrency } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/constants";
import { MetricExplainer } from "@/components/shared/metric-explainer";
import { TrendingUp, TrendingDown, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden animate-pulse">
      <div className="h-10 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-gray-100 rounded w-3/4" />
        <div className="h-8 bg-gray-100 rounded w-1/2" />
        <div className="h-5 bg-gray-100 rounded w-2/3" />
        <div className="h-5 bg-gray-100 rounded w-3/5" />
        <div className="h-5 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  );
}

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
    <div className={`flex items-center justify-between py-2 ${isBold || isHero ? "font-semibold" : ""}`}>
      <span className={`text-[14px] min-w-0 truncate ${isBold || isHero ? "text-gray-800" : "text-gray-600"}`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
        <span
          className={`whitespace-nowrap font-medium ${
            isHero ? "text-[32px] font-bold leading-10" : "text-[14px]"
          } ${
            isNegative ? "text-red-600" : isBold || isHero ? "text-gray-900" : "text-gray-800"
          }`}
        >
          {value}
          {suffix && <span className="text-xs text-gray-500 ml-1">{suffix}</span>}
        </span>
        {explainer && <MetricExplainer {...explainer} />}
      </div>
    </div>
  );
}

function Separator() {
  return <div className="border-t border-gray-200 my-1" />;
}

function HeavySeparator() {
  return <div className="border-t-2 border-gray-300 my-2" />;
}

function CardHeader({
  title,
  theme,
  collapsed,
  onToggle,
}: {
  title: string;
  theme: keyof typeof CARD_THEMES;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = CARD_THEMES[theme];
  return (
    <button
      onClick={onToggle}
      className={`${t.header} px-4 py-2.5 w-full flex items-center justify-between cursor-pointer md:cursor-default`}
    >
      <h2 className="text-white font-semibold text-sm uppercase tracking-wide">{title}</h2>
      <span className="text-white/80 md:hidden">
        {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </span>
    </button>
  );
}

function DashboardCard({
  title,
  theme,
  children,
  className = "",
}: {
  title: string;
  theme: keyof typeof CARD_THEMES;
  children: React.ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const t = CARD_THEMES[theme];

  return (
    <div className={`rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border ${t.border} overflow-hidden ${className}`}>
      <CardHeader title={title} theme={theme} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {!collapsed && <div className={`${t.bg} p-4`}>{children}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = trpc.dashboard.getMetrics.useQuery();

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { cc, money, gst, margins, inventory, stats } = data;

  // Check if everything is zero (empty state)
  const isEmpty =
    stats.totalPurchases === 0 &&
    stats.totalSales === 0 &&
    cc.outstanding === 0 &&
    inventory.length === 0;

  if (isEmpty) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">Dashboard</h1>
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">Welcome!</div>
          <p className="text-gray-600 mb-2">Your dashboard will come alive once you start recording transactions.</p>
          <p className="text-gray-500 text-sm">
            Start by adding your{" "}
            <Link href="/products" className="text-blue-600 underline">products</Link> and{" "}
            <Link href="/contacts" className="text-blue-600 underline">contacts</Link>, then record your first{" "}
            <Link href="/purchases/new" className="text-blue-600 underline">purchase</Link>.
          </p>
        </div>
      </div>
    );
  }

  // CC utilization bar color
  const ccBarColor =
    cc.utilizationPct > 80
      ? "bg-red-500"
      : cc.utilizationPct > 50
      ? "bg-yellow-500"
      : "bg-green-500";

  // Pulsing border class for critical CC
  const ccCardClass = cc.utilizationPct > 80 ? "animate-pulse-border border-2" : "";

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1B4F72] mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: CC Account Position */}
        <DashboardCard title="CC ACCOUNT POSITION" theme="cc" className={ccCardClass}>
          <MetricRow
            label="CC used"
            value={formatIndianCurrency(cc.outstanding)}
            explainer={{
              title: "CC Outstanding",
              description: "Total amount you've drawn from PNB CC account that hasn't been repaid yet.",
              formula: "Sum of all draws minus sum of all repayments",
              action: "Check CC Ledger for any missing repayment entries.",
            }}
            isHero
          />

          {/* Progress bar */}
          <div className="my-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Utilisation</span>
              <span>{cc.utilizationPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${ccBarColor}`}
                style={{ width: `${Math.min(cc.utilizationPct, 100)}%` }}
              />
            </div>
            <div className="flex items-center mt-1">
              <MetricExplainer
                title="Utilisation %"
                description="What percentage of your CC limit you've used. Below 50% is healthy. Above 80% means you're running tight."
                formula="Outstanding / CC Limit x 100"
              />
            </div>
          </div>

          <MetricRow
            label="Available"
            value={formatIndianCurrency(cc.available)}
            explainer={{
              title: "Available",
              description: "How much more you can draw from CC. = CC Limit - Outstanding.",
              formula: "CC Limit - Outstanding",
            }}
          />
          <MetricRow
            label="Limit"
            value={formatIndianCurrency(cc.limit)}
            explainer={{
              title: "CC Limit",
              description: "Maximum amount you can draw from your PNB CC account. Set this in Settings.",
              action: "Go to Settings to update your CC limit.",
            }}
          />
          <Separator />
          <MetricRow
            label="Interest (calculated)"
            value={formatIndianCurrency(cc.calculatedInterest)}
            explainer={{
              title: "Interest (calculated)",
              description: "Interest we calculated day-by-day based on your CC balance. Formula: each day's balance x interest rate / 365, added up.",
              formula: "Sum of (daily balance x rate / 365) for each day",
              action: "Ensure all CC draws and repayments are recorded with correct dates.",
            }}
          />
          <MetricRow
            label="Interest (actual)"
            value={formatIndianCurrency(cc.actualInterest)}
            explainer={{
              title: "Interest (actual)",
              description: "What PNB actually charged you -- enter this monthly in Settings from your bank statement.",
              action: "Go to Settings and enter actual interest from your bank statement.",
            }}
          />
          <div className="flex items-center justify-between py-2">
            <span className="text-[14px] text-gray-600">Difference</span>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                {cc.difference > 0 ? (
                  <TrendingUp size={14} className="text-red-500" />
                ) : cc.difference < 0 ? (
                  <TrendingDown size={14} className="text-green-500" />
                ) : null}
                <span className={`text-[14px] font-medium ${cc.difference > 0 ? "text-red-600" : cc.difference < 0 ? "text-green-600" : "text-gray-600"}`}>
                  {formatIndianCurrency(Math.abs(cc.difference))}
                </span>
              </div>
              <MetricExplainer
                title="Interest Difference"
                description="Gap between what we calculated and what PNB charged. A large difference means entries may be missing."
                formula="Calculated Interest - Actual Interest"
                action="Check if all CC entries are recorded. Update actual interest in Settings."
              />
            </div>
          </div>
        </DashboardCard>

        {/* Card 2: Where Is My Money? */}
        <DashboardCard title="WHERE IS MY MONEY?" theme="money">
          <MetricRow
            label="Stock in Hand"
            value={formatIndianCurrency(money.cashInInventory)}
            explainer={{
              title: "Stock in Hand",
              description: "Value of yarn sitting in your godown that hasn't been sold yet. Calculated at your purchase cost.",
              formula: "Total Purchase Base - Cost of Goods Sold",
              action: "Make sure all sales are recorded to get an accurate number.",
            }}
            isHero
          />
          <MetricRow
            label="They Owe You"
            value={formatIndianCurrency(money.totalReceivables)}
            explainer={{
              title: "They Owe You (Receivables)",
              description: "Total amount buyers haven't paid you yet.",
              formula: "Total Sale (incl GST) - Amount Received - Payments Received",
              action: "Record any received payments that are missing.",
            }}
          />
          <MetricRow
            label="You Owe Them"
            value={formatIndianCurrency(money.totalPayables)}
            explainer={{
              title: "You Owe Them (Payables)",
              description: "Total amount you haven't paid suppliers yet.",
              formula: "Total Purchase (incl GST + transport) - Amount Paid - Payments Made",
              action: "Record any payments you've already made to mills.",
            }}
          />
          <MetricRow
            label="Broker Pending"
            value={formatIndianCurrency(money.brokerPending)}
            explainer={{
              title: "Broker Commission Pending",
              description: "Broker commission earned on sales minus what you've already paid brokers.",
              formula: "Total Broker Commission - Broker Payments Made",
            }}
          />
          <Separator />
          <MetricRow
            label="Transport Spent"
            value={formatIndianCurrency(money.totalTransport)}
            explainer={{
              title: "Transport Spent",
              description: "Total transport costs across all purchases and sales.",
              formula: "Purchase Transport + Sale Transport",
            }}
          />
          <div className="pt-3">
            <Link
              href="/ledger"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View Full Ledger <ArrowRight size={14} />
            </Link>
          </div>
        </DashboardCard>

        {/* Card 3: GST Position */}
        <DashboardCard title="GST POSITION" theme="gst">
          <MetricRow
            label="Output GST"
            value={formatIndianCurrency(gst.outputGst)}
            explainer={{
              title: "Output GST",
              description: "GST you collected from your buyers on sales.",
              formula: "Sum of (sale base amount x GST%) for all sales",
            }}
          />
          <MetricRow
            label="Input GST"
            value={formatIndianCurrency(gst.inputGst)}
            explainer={{
              title: "Input GST",
              description: "GST you paid to mills on purchases.",
              formula: "Sum of (purchase base amount x GST%) for all purchases",
            }}
          />
          <HeavySeparator />
          <MetricRow
            label="Net GST Payable"
            value={formatIndianCurrency(gst.netPayable)}
            isNegative={gst.netPayable > 0}
            isHero
            explainer={{
              title: "Net GST Payable",
              description: "If positive, you owe this to the government. If negative, you have ITC credit.",
              formula: "Output GST - Input GST",
              action: "Ensure all purchase and sale GST percentages are correct.",
            }}
          />
          <MetricRow
            label="ITC Available"
            value={formatIndianCurrency(gst.itcAvailable)}
            explainer={{
              title: "ITC Available",
              description: "Input Tax Credit you can carry forward. Only shows when Input GST exceeds Output GST.",
              formula: "Max(0, Input GST - Output GST)",
            }}
          />
        </DashboardCard>

        {/* Card 4: Your Profit */}
        <DashboardCard title="YOUR PROFIT" theme="margins">
          <MetricRow
            label="Revenue (excl GST)"
            value={formatIndianCurrency(margins.revenue)}
            explainer={{
              title: "Revenue",
              description: "Total sale amount before GST.",
              formula: "Sum of (qty x rate) for all sales",
            }}
          />
          <MetricRow
            label="Cost of Goods"
            value={formatIndianCurrency(margins.cogs)}
            explainer={{
              title: "COGS",
              description: "What you paid for the yarn you sold, calculated using weighted average cost.",
              formula: "For each sale: (total purchase cost of that product / total kg purchased) x kg sold",
              action: "Ensure purchase costs and quantities are accurate.",
            }}
          />
          <MetricRow
            label="Transport"
            value={formatIndianCurrency(margins.transport)}
            explainer={{
              title: "Sale Transport",
              description: "Transport costs on sales that reduce your margin.",
            }}
          />
          <MetricRow
            label="Broker Commission"
            value={formatIndianCurrency(margins.brokerCommission)}
            explainer={{
              title: "Broker Commission",
              description: "Total commission earned by brokers on your sales.",
              formula: "Per bag: qty x commission per bag. Percentage: base amount x commission %",
            }}
          />
          <HeavySeparator />
          <div className="flex items-center justify-between py-2 font-semibold">
            <span className="text-[14px] text-gray-800">GROSS MARGIN</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[32px] font-bold leading-10 ${margins.grossMargin >= 0 ? "text-green-700" : "text-red-600"}`}>
                {formatIndianCurrency(margins.grossMargin)}
              </span>
              <span className="text-xs text-gray-500">({margins.grossMarginPct}%)</span>
              <MetricExplainer
                title="Gross Margin"
                description="Revenue minus COGS minus transport minus broker commission. Trading profit BEFORE CC interest."
                formula="Revenue - COGS - Transport - Broker Commission"
              />
            </div>
          </div>
          <MetricRow
            label="CC Interest (actual)"
            value={formatIndianCurrency(margins.ccInterest)}
            explainer={{
              title: "CC Interest",
              description: "Actual CC interest charged by the bank, deducted from gross margin to get net margin.",
            }}
          />
          <Separator />
          <div className="flex items-center justify-between py-2 font-bold">
            <span className="text-[14px] text-gray-900">NET MARGIN</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[32px] font-bold leading-10 ${margins.netMargin >= 0 ? "text-green-700" : "text-red-600"}`}>
                {formatIndianCurrency(margins.netMargin)}
              </span>
              <span className="text-xs font-semibold text-gray-500">({margins.netMarginPct}%)</span>
              <MetricExplainer
                title="Net Margin"
                description="Gross margin minus CC interest. Your TRUE bottom-line profit."
                formula="Gross Margin - CC Interest (actual)"
                action="If negative, you're losing money. Review your pricing and costs."
              />
            </div>
          </div>
        </DashboardCard>

        {/* Card 5: Stock in Hand */}
        <DashboardCard title="STOCK IN HAND" theme="inventory">
          {inventory.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No inventory in hand.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[13px]">
                    <th className="text-left py-1.5 font-semibold">Product</th>
                    <th className="text-right py-1.5 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        Bags
                        <MetricExplainer
                          title="Bags in Hand"
                          description="Number of bags purchased minus number of bags sold for this product."
                          formula="Purchased Bags - Sold Bags"
                        />
                      </span>
                    </th>
                    <th className="text-right py-1.5 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        Kg
                        <MetricExplainer
                          title="Kg in Hand"
                          description="Total weight of yarn in hand for this product."
                          formula="Purchased Kg - Sold Kg"
                        />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, idx) => (
                    <tr key={idx} className="border-t border-purple-100">
                      <td className="py-1.5 text-gray-700">{item.productName}</td>
                      <td className="py-1.5 text-right text-gray-800 font-medium">{item.bagsInHand}</td>
                      <td className="py-1.5 text-right text-gray-800 font-medium">
                        {item.kgInHand.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-purple-200 font-semibold">
                    <td className="py-1.5 text-gray-800">Total</td>
                    <td className="py-1.5 text-right text-gray-800">
                      {inventory.reduce((s, i) => s + i.bagsInHand, 0)}
                    </td>
                    <td className="py-1.5 text-right text-gray-800">
                      {inventory.reduce((s, i) => s + i.kgInHand, 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DashboardCard>

        {/* Card 6: Quick Stats */}
        <DashboardCard title="QUICK STATS" theme="stats">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[13px] text-gray-500 font-semibold">Total Purchases</span>
                <MetricExplainer
                  title="Total Purchases"
                  description="Number of purchase transactions recorded (excluding deleted)."
                />
              </div>
              <p className="text-[32px] font-bold text-gray-800 leading-10">{stats.totalPurchases}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[13px] text-gray-500 font-semibold">Pending Pay</span>
                <MetricExplainer
                  title="Pending Payments"
                  description="Number of purchases where full payment hasn't been made yet."
                />
              </div>
              <p className="text-[32px] font-bold text-orange-600 leading-10">{stats.pendingPayments}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[13px] text-gray-500 font-semibold">Total Sales</span>
                <MetricExplainer
                  title="Total Sales"
                  description="Number of sale transactions recorded (excluding deleted)."
                />
              </div>
              <p className="text-[32px] font-bold text-gray-800 leading-10">{stats.totalSales}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[13px] text-gray-500 font-semibold">Pending Coll</span>
                <MetricExplainer
                  title="Pending Collections"
                  description="Number of sales where full payment hasn't been collected yet."
                />
              </div>
              <p className="text-[32px] font-bold text-orange-600 leading-10">{stats.pendingCollections}</p>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
