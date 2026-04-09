# SYT ERP — Implementation Specification

> Guiding document for Claude Code to implement Sarthak Yarn Trading's business management system.
> Phase 1: Desktop web app + Mobile PWA. Single user. Single CC account.

---

## 1. What This System Does

Sarthak Yarn Trading (SYT) buys yarn in bulk from mills and sells in smaller lots to local buyers. The business runs on WhatsApp calls, mental math, and Tally for basic accounting. This system replaces the Excel tracker with a proper web application.

**Three questions this system answers every morning:**
1. Where is my money? (inventory + receivables + payables + CC)
2. What am I actually making? (true margins after CC interest, transport, broker commission)
3. Who owes me what? (party-wise ledger with aging)

**Phase 1 scope:** Desktop + PWA. Data entry via structured forms. Dashboard with real-time metrics. No WhatsApp bot (Phase 2). No multi-user (Phase 2). No market rate data (Phase 2). Invoicing happens in Tally — not in this system.

---

## 2. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + PWA | SSR for speed, PWA for mobile install, Tailwind for rapid UI |
| Backend | Next.js API Routes (or tRPC if preferred) | Colocated, type-safe, no separate deploy |
| Database | PostgreSQL + Drizzle ORM | Relational data, strong consistency, SQL for reports |
| Auth | Phone OTP (SMS via Twilio/MSG91) | No email needed, matches user behavior. Single login for now. |
| Hosting | Vercel (app) + Supabase or Neon (Postgres) | Low ops, auto-scaling, affordable |
| PWA | next-pwa or Serwist | Offline form queuing, installable on Android |

**Estimated infra cost:** ~$50-80/mo at MVP stage.

---

## 3. Data Model

> Derived directly from the working Excel tracker (10 tabs, 126K formulas). The spreadsheet is the source of truth for business logic.
> See `DATA_MODEL.md` for complete schema with field-level detail.

### 3.1 Core Entities

**Config** — Business-level settings. Single row per tenant.
- `cc_limit` (default: ₹50,00,000)
- `cc_interest_rate` (default: 11% p.a.)
- `default_kg_per_bag` (default: 100)
- `default_gst_rate` (default: 5%)
- `overdue_days_threshold` (default: 30)
- `monthly_actual_cc_interest[]` — 12 monthly values from PNB statement (Apr-Mar)

**Contact** — Mills, Buyers, Brokers.
- `name`, `type` (enum: Mill | Buyer | Broker), `phone`, `city`
- `broker_commission_type` (enum: per_bag | percentage) — **configurable per broker**
- `broker_commission_value` (₹/bag or % depending on type)
- `notes`

**Product** — Yarn products.
- `mill_brand`, `fibre_type` (PC, Cotton, Polyester, Viscose, etc.), `count` (30s, 40s, etc.), `quality_grade` (Top, Standard, Economy)
- `full_name` = computed: `"{mill} {fibre} {count} {grade}"`
- `active` (boolean)

**Purchase** — Buying from mills.
- Input fields: `date`, `product_id`, `lot_no`, `supplier_id`, `via_broker` (bool), `broker_id`, `qty_bags`, `kg_per_bag` (defaults from config), `rate_per_kg`, `gst_pct` (dropdown: 0/5/12/18/28%), `transport`, `cc_draw_date` (nullable — if funded via CC draw), `amount_paid`
- Computed: `total_kg` = qty_bags × kg_per_bag, `base_amount` = total_kg × rate, `gst_amount` = base × gst%, `total_incl_gst` = base + gst, `grand_total` = total_incl_gst + transport, `balance_due` = grand_total - amount_paid - linked_payments, `status` (Pending | Partial | Paid)

**Sale** — Selling to buyers.
- Input fields: `date`, `product_id`, `buyer_id`, `via_broker` (bool), `broker_id`, `qty_bags`, `kg_per_bag`, `rate_per_kg`, `gst_pct`, `transport`, `amount_received`
- Computed: `total_kg`, `base_amount`, `gst_amount`, `total_incl_gst`, `avg_cost` (weighted avg from purchases of same product), `cogs` = avg_cost × total_kg, `broker_commission` (see commission logic below), `gross_margin` = base_amount - cogs - transport - commission, `gross_margin_pct`, `balance_receivable` = total_incl_gst - received - linked_payments, `status` (Pending | Partial | Received)

**Payment** — Cash flows.
- `date`, `party_id`, `direction` (Paid | Received), `amount`, `mode` (Cash, NEFT, UPI, Cheque, RTGS), `against_txn_id` (nullable — links to Purchase or Sale ID), `reference`, `notes`

**CC Entry** — Cash Credit ledger.
- `date`, `event` (Draw | Repay), `amount`
- Computed: `running_balance` (cumulative: draw adds, repay subtracts)

**CC Interest Monthly** — Reconciliation between calculated and actual.
- `month` (Apr-Mar), `calculated_interest` (from daily accrual), `actual_interest` (user inputs from PNB statement), `difference`

### 3.2 Computed Views (not stored — calculated on read)

- **Party Ledger** — Per contact: total billed/owed, total paid/received, net balance, direction (Payable/Receivable/Clear)
- **Inventory Position** — Per product: bags purchased - bags sold, kg purchased - kg sold
- **GST Summary** — Output GST (sales) - Input GST (purchases) = Net Payable or ITC
- **Dashboard Metrics** — All KPIs derived real-time from the above

### 3.3 Key Business Logic

**Weighted Average Cost:**
```
avg_cost_per_kg(product) = SUM(base_amount WHERE product matches) / SUM(total_kg WHERE product matches)
```
This is across ALL purchases of that product (not FIFO, not LIFO — weighted average).

**Broker Commission (configurable per broker):**
```
if broker.commission_type == "per_bag":
    commission = qty_bags × broker.commission_value
elif broker.commission_type == "percentage":
    commission = base_amount × broker.commission_value / 100
```
Commission applies on sales. On purchases, broker commission is tracked in the ledger (qty_bags × commission_value for the broker).

**CC Interest (daily accrual):**
```
For each CC entry row:
    days = next_entry_date - this_entry_date (or TODAY if last entry)
    interest = running_balance × days × annual_rate / 365
Total calculated interest = SUM of all daily interest
```
Monthly reconciliation: user enters actual interest from PNB statement. Difference = calculated - actual.

**Balance Due (Purchases):**
```
balance = grand_total - amount_paid - SUM(payments WHERE party matches AND against_txn = this purchase ID)
```

**Balance Receivable (Sales):**
```
balance = total_incl_gst - amount_received - SUM(payments WHERE party matches AND against_txn = this sale ID)
```

**Status Auto-Calculation:**
```
Purchases: balance <= 0 → "Paid", balance < grand_total → "Partial", else "Pending"
Sales: balance <= 0 → "Received", balance < total_incl_gst → "Partial", else "Pending"
```

**GST Position:**
```
output_gst = SUM(gst_amount on all sales)
input_gst = SUM(gst_amount on all purchases)
net_payable = output_gst - input_gst
itc_available = ABS(net_payable) if net_payable < 0 else 0
```

**Inventory:**
```
bags_in_hand(product) = SUM(purchase qty) - SUM(sale qty)
kg_in_hand(product) = SUM(purchase total_kg) - SUM(sale total_kg)
cash_in_inventory = SUM(purchase base_amount) - SUM(sale cogs)
```

**Margins:**
```
gross_margin = total_revenue(base) - total_cogs - total_transport(sales) - total_broker_commission
net_margin = gross_margin - actual_cc_interest(from config monthly totals)
```

**Returns Handling (minimal — very rare):**
- A return is recorded as a negative-quantity Purchase (for purchase returns) or negative-quantity Sale (for sale returns).
- All formulas naturally handle negative quantities — balances adjust, inventory adjusts, margins adjust.
- No separate Returns entity needed in Phase 1.

---

## 4. Application Structure

### 4.1 Pages / Routes

```
/                       → Dashboard (default landing)
/purchases              → Purchases list + add form
/purchases/[id]         → Purchase detail
/sales                  → Sales list + add form
/sales/[id]             → Sale detail
/payments               → Payments list + add form
/cc-ledger              → CC account ledger + add draw/repay
/ledger                 → Party-wise ledger view
/contacts               → Contact master (CRUD)
/products               → Product master (CRUD)
/settings               → Config (CC limit, rates, defaults, monthly actual interest)
/recon                  → Tally reconciliation (paste Tally export, auto-match)
/login                  → Phone OTP login
```

### 4.2 Navigation

Bottom tab bar on mobile (PWA): Dashboard | Purchases | Sales | Payments | More (ledger, CC, contacts, products, settings, recon)

Sidebar on desktop: All routes visible.

### 4.3 Form Design Principles

- **Pre-fill aggressively:** kg/bag from config, GST from config, broker commission from contact record.
- **Dropdowns for everything relational:** Product (from Products master), Supplier/Buyer/Broker (from Contacts), GST rate (0/5/12/18/28%), payment mode (Cash/NEFT/UPI/Cheque/RTGS).
- **Running total as you type:** Show base amount, GST, grand total updating live as user fills qty/rate/gst%.
- **Validation:** Don't allow save without product + party + qty + rate at minimum.
- **Recent-first:** Default sort by date descending everywhere.

---

## 5. Dashboard Specification

> The dashboard is the heart of the app. Design it as a "morning tea review" — 5 minutes to understand the entire business.
> See `UI_UX_SPEC.md` for detailed card layouts and metric explanations.

### Dashboard Cards (in order):

**Card 1: CC Account Position**
- CC Limit, Outstanding Balance, Available, Utilisation %
- Calculated Interest (from CC ledger daily accrual)
- Actual Interest (from PNB statement — user input in settings)
- Difference (calc - actual)
- Color: Red theme

**Card 2: Where Is My Money?**
- Cash in Inventory (at cost)
- Total Receivables (from buyers)
- Total Payables (to mills)
- Broker Commission Pending
- Total Transport Costs
- Color: Blue theme

**Card 3: GST Position**
- Output GST (collected on sales)
- Input GST (paid on purchases)
- Net GST Payable
- ITC Available
- Color: Teal theme

**Card 4: Margins & Profitability**
- Total Revenue (base, excl GST)
- Total COGS
- Total Transport (on sales)
- Total Broker Commission
- Gross Margin (₹ + %)
- CC Interest Cost (actual)
- Net Margin (₹ + %)
- Color: Green theme

**Card 5: Inventory in Hand**
- Per product: bags in hand, kg in hand
- Color: Purple theme

**Card 6: Quick Stats**
- Total purchase orders, total sales
- Pending purchase payments, pending sale collections
- Color: Orange theme

### Metric Explainer Pattern

**Every metric on the dashboard must have a (?) icon that shows a tooltip/modal explaining:**
1. What this number means in plain language
2. How it's calculated (formula in words)
3. What action to take if it looks wrong

Example:
> **Gross Margin** (?)
> "This is how much you're making on your trades after deducting what you paid for the yarn (COGS), transport, and broker commission. It does NOT include CC interest — see Net Margin for that."
> Formula: Total Sales Revenue − Total COGS − Transport on Sales − Broker Commission
> If it looks wrong: Check if your purchase rates and sale rates are entered correctly. Also verify broker commission in the Contacts screen.

---

## 6. Tally Reconciliation

- User exports Sundry Debtors + Creditors from Tally as Excel/CSV.
- User pastes/uploads into the Recon screen: Party Name, Balance, Type (Debtor/Creditor).
- System auto-matches Tally party names to Contacts (exact match first, then fuzzy).
- For each matched party: compare Tally balance vs Sheet balance.
- Status: Matched (diff = 0), Minor Variance (diff < threshold), Mismatch (diff >= threshold), Not in Sheet.
- Summary: total matched, mismatches, total difference amount.
- Configurable variance threshold (default: ₹500).

---

## 7. Offline / PWA Behavior

- Forms work offline — transactions queue in IndexedDB.
- When connectivity returns, queued transactions sync to server.
- Dashboard shows "last synced" timestamp.
- Show offline indicator in header.
- Service worker caches app shell and recent data.

---

## 8. Phase 2 Hooks (build for but don't implement)

Structure the code so these are easy to add later:
- **WhatsApp Bot:** Transaction service is already an API — bot will just call the same endpoints. Keep transaction parsing logic separable.
- **Multi-user:** Add `tenant_id` to all tables from Day 1. Single login for now, but the schema supports multi-tenant.
- **Market rate data:** Product entity has no `market_rate` field yet — add in Phase 2.
- **Invoice generation:** Not in scope. All invoicing via Tally.
- **Notifications:** No push notifications in Phase 1. Build notification preferences in settings but leave disabled.

---

## 9. Configuration System

All business logic parameters must be configurable through the Settings screen:

| Setting | Default | Notes |
|---------|---------|-------|
| CC Limit (₹) | 50,00,000 | PNB sanctioned CC limit |
| CC Interest Rate (% p.a.) | 11% | Current CC interest rate |
| Default Kg per Bag | 100 | Override-able per transaction |
| Default GST Rate | 5% | Most common yarn GST slab |
| Overdue Days Threshold | 30 | Days after which balance is flagged overdue |
| Monthly Actual CC Interest | 12 fields (Apr-Mar) | User enters from PNB statement |

Broker commission is **per-broker configurable** in the Contacts screen:
- Type: "Per Bag" or "Percentage"
- Value: ₹ amount (if per bag) or % (if percentage)

---

## 10. Reference Files

| File | Description |
|------|-------------|
| `Sarthak_Yarn_Trading_Tracker.xlsx` | Working Excel tracker with all business logic encoded as formulas. The source of truth. |
| `Sarthak_Yarn_Tracker_Guide.pdf` | Step-by-step guide for the Excel tracker. Useful for understanding user workflows. |
| `SYT_Product_Spec.docx` | Original product specification (includes monetization, ICP, build plan — context only). |
| `DATA_MODEL.md` | Complete database schema with Drizzle ORM definitions, all computed fields, and formula references. |
| `UI_UX_SPEC.md` | Screen-by-screen UI spec with component hierarchy, metric explainers, and mobile/desktop layouts. |

---

## 11. Implementation Order

1. **Database + Config** — Set up Postgres, Drizzle schema, seed config defaults.
2. **Auth** — Phone OTP login. Single user.
3. **Master Data** — Products CRUD, Contacts CRUD (with broker commission config).
4. **Purchases** — Form + list + computed fields (total_kg, base, gst, grand_total, balance, status).
5. **Sales** — Form + list + computed fields (avg_cost, cogs, commission, margin, balance, status).
6. **Payments** — Form + list + linking to purchases/sales.
7. **CC Ledger** — Draw/repay form, running balance, daily interest calculation.
8. **Ledger View** — Per-party aggregated view from purchases + sales + payments.
9. **Dashboard** — All 6 cards with real-time computed metrics + explainer tooltips.
10. **Tally Recon** — Upload/paste, auto-match, diff display.
11. **PWA** — Service worker, offline forms, install prompt.
12. **Polish** — Loading states, error handling, empty states, mobile responsiveness.
