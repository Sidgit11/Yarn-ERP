# SYT ERP — UI/UX Specification

> Screen-by-screen spec for the PWA + Desktop web app.
> Designed for a "boomer-friendly" experience — the user (Sarthak) is a yarn trader, not a tech person.
> Every number on screen must be understandable without training.

---

## Design Principles

1. **No jargon.** Say "Money stuck in stock" not "Inventory carrying cost". Say "How much they owe you" not "Accounts receivable".
2. **Every metric has a (?) explainer.** Tapping (?) opens a bottom sheet (mobile) or tooltip (desktop) with: what it means, how it's calculated, what to do if it looks wrong.
3. **Big numbers, few colors.** Dashboard cards use large font for the primary metric. Secondary details in smaller text below.
4. **Hindi-friendly labels.** All labels in English but use Hindi business terms where natural: "Sauda" for deal, "Baki" for balance, "Dhaga" for yarn. (Consider bilingual toggle in Phase 2.)
5. **One action per screen.** Add purchase is one screen. Not a modal inside a table inside a tab.
6. **Confirmation before save.** Show a summary card before committing any transaction: "You're recording: 50 bags × ₹200/kg = ₹10,50,000 incl GST. Supplier: Rajendra Mills. Save?"
7. **Forgiving inputs.** Accept "10L" or "1000000" for ₹10,00,000. Accept "5%" or "0.05" for GST rate.

---

## Color System

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| CC / Risk | Red | `#C0392B` | CC position, overdue amounts |
| Money Flow | Blue | `#2980B9` | Where is my money, receivables |
| Profit | Green | `#27AE60` | Margins, positive metrics |
| Inventory | Purple | `#8E44AD` | Stock position |
| Activity | Orange | `#E67E22` | Quick stats, purchases |
| Tax | Teal | `#16A085` | GST, payments |
| Background | Light Blue | `#EBF5FB` | Metric value backgrounds |
| Header | Dark Blue | `#1B4F72` | Section headers |
| Text | Dark Grey | `#2C3E50` | Body text |

---

## Screen Specifications

### Login (`/login`)

Simple phone number + OTP screen.

```
┌─────────────────────────────┐
│                             │
│        SYT                  │
│   Sarthak Yarn Trading      │
│                             │
│   ┌───────────────────┐     │
│   │ +91  9876543210   │     │
│   └───────────────────┘     │
│                             │
│   [ Send OTP ]              │
│                             │
│   ┌───────────────────┐     │
│   │ ● ● ● ●          │     │
│   └───────────────────┘     │
│                             │
│   [ Verify & Login ]        │
│                             │
└─────────────────────────────┘
```

- Auto-read OTP from SMS if possible (Web OTP API).
- No password, no email. Phone number is the identity.

---

### Dashboard (`/`)

**Mobile layout:** Stacked cards, scrollable. Each card is a collapsible section.

**Desktop layout:** 2-column grid. CC + Money on left, GST + Margins on right. Inventory + Stats below.

#### Card 1: CC Account Position (Red theme)

```
┌─ CC ACCOUNT ──────────────────────────────────┐
│                                                │
│  Outstanding     ₹10,00,000                    │
│  ━━━━━━━━━━━━━━━━━━━━━━ 20%                   │  ← progress bar
│  Available       ₹40,00,000    Limit ₹50L      │
│                                                │
│  Interest (calc)    ₹4,219     (?)             │
│  Interest (actual)  ₹4,000     (?)             │
│  Difference         ₹219 ↑                     │
│                                                │
└────────────────────────────────────────────────┘
```

**Metric Explainers:**

| Metric | (?) Explainer |
|--------|--------------|
| Outstanding | "Total amount you've drawn from PNB CC account that hasn't been repaid yet. This is your current CC debt." |
| Available | "How much more you can draw from CC. = CC Limit − Outstanding." |
| Utilisation % | "What percentage of your CC limit you've used. Below 50% is healthy. Above 80% means you're running tight." |
| Interest (calculated) | "Interest we calculated day-by-day based on your CC balance. Formula: each day's balance × interest rate ÷ 365, added up." |
| Interest (actual) | "What PNB actually charged you — enter this monthly in Settings from your bank statement." |
| Difference | "Gap between our calculation and PNB's charge. Small differences (< ₹500) are normal. Large gaps mean check your CC entries." |

#### Card 2: Where Is My Money? (Blue theme)

```
┌─ WHERE IS MY MONEY? ─────────────────────────┐
│                                                │
│  📦 Stuck in Stock      ₹6,00,000      (?)   │
│  📥 Others Owe You      ₹1,60,000      (?)   │
│  📤 You Owe Mills       ₹5,55,000      (?)   │
│  🤝 Broker Pending       ₹8,500        (?)   │
│  🚛 Transport Spent     ₹25,000        (?)   │
│                                                │
│  [ View Full Ledger → ]                        │
│                                                │
└────────────────────────────────────────────────┘
```

**Metric Explainers:**

| Metric | (?) Explainer |
|--------|--------------|
| Stuck in Stock | "Value of yarn sitting in your godown that hasn't been sold yet. Calculated at your purchase cost (not selling price). = Total purchase cost − Cost of goods sold." |
| Others Owe You | "Total amount buyers haven't paid you yet. Check the Ledger screen to see who owes what." |
| You Owe Mills | "Total amount you haven't paid suppliers yet. This is your purchase balance." |
| Broker Pending | "Commission you owe to brokers that hasn't been paid yet." |
| Transport Spent | "Total transport costs on both purchases and sales." |

#### Card 3: GST Position (Teal theme)

```
┌─ GST POSITION ────────────────────────────────┐
│                                                │
│  Output GST (sales)     ₹22,000        (?)    │
│  Input GST (purchases)  ₹50,000        (?)    │
│  ─────────────────────────────                 │
│  Net GST Payable        -₹28,000       (?)    │
│  ITC Available          ₹28,000        (?)    │
│                                                │
└────────────────────────────────────────────────┘
```

**Metric Explainers:**

| Metric | (?) Explainer |
|--------|--------------|
| Output GST | "GST you collected from your buyers on sales. You need to pay this to the government." |
| Input GST | "GST you paid to mills on purchases. You can claim this back (ITC)." |
| Net GST Payable | "Output − Input. If positive, you owe the government. If negative, government owes you (ITC). Negative is shown here." |
| ITC Available | "Input Tax Credit — the GST refund you can claim because you paid more GST on purchases than you collected on sales. Use this to offset future GST liability." |

#### Card 4: Margins & Profitability (Green theme)

```
┌─ MARGINS ─────────────────────────────────────┐
│                                                │
│  Revenue (excl GST)     ₹4,40,000      (?)    │
│  Cost of Goods          ₹4,00,000      (?)    │
│  Transport              ₹5,000         (?)    │
│  Broker Commission      ₹2,100         (?)    │
│  ─────────────────────────────                 │
│  GROSS MARGIN           ₹32,900  (7.5%)       │
│                                                │
│  CC Interest (actual)   ₹4,000         (?)    │
│  ─────────────────────────────                 │
│  NET MARGIN             ₹28,900  (6.6%)       │
│                                                │
└────────────────────────────────────────────────┘
```

**Metric Explainers:**

| Metric | (?) Explainer |
|--------|--------------|
| Revenue | "Total sale amount before GST. This is your top-line earning from all trades." |
| Cost of Goods (COGS) | "What you paid for the yarn you sold, calculated using weighted average cost. If you bought 30s Top from multiple mills at different rates, we average them." |
| Transport | "Transport cost on your sales only (not purchases). Purchase transport is already in your cost." |
| Broker Commission | "Total commission paid/payable to brokers. Configured per broker — either ₹/bag or % of sale amount." |
| Gross Margin | "Revenue minus COGS minus transport minus broker commission. This is your trading profit BEFORE CC interest." |
| CC Interest | "Actual interest charged by PNB (from your bank statement). Enter monthly in Settings." |
| Net Margin | "Gross margin minus CC interest. This is your TRUE bottom-line profit. The number that matters." |

#### Card 5: Inventory in Hand (Purple theme)

```
┌─ INVENTORY IN HAND ───────────────────────────┐
│                                                │
│  Product                  Bags    Kg           │
│  ─────────────────────────────────             │
│  Rajendra PC 30s Top       30    3,000         │
│  Rajendra PC 40s Std       15    1,500         │
│  Vardhman Cotton 30s Top   10    1,000         │
│                                                │
│  Total                     55    5,500         │
│                                                │
└────────────────────────────────────────────────┘
```

#### Card 6: Quick Stats (Orange theme)

```
┌─ QUICK STATS ─────────────────────────────────┐
│                                                │
│  Total Purchases     12        Pending Pay  5  │
│  Total Sales          8        Pending Coll 3  │
│                                                │
└────────────────────────────────────────────────┘
```

---

### Purchase Entry (`/purchases/new`)

**Mobile: Full-screen form. Desktop: Side panel or dedicated page.**

Form fields in order (top to bottom):

```
DATE            [ 29-Mar-2026 ]          ← defaults to today

PRODUCT         [ Rajendra PC 30s Top ▼ ]  ← dropdown from Products
LOT NO.         [ ______________ ]         ← free text, optional

SUPPLIER        [ Rajendra Mills ▼ ]       ← dropdown, filtered to type=Mill
VIA BROKER?     [ Yes ○  No ● ]
BROKER          [ Suresh Broker ▼ ]        ← shows only if Yes, filtered to type=Broker

QTY (BAGS)      [ 50 ]
KG PER BAG      [ 100 ]                   ← pre-filled from config, editable
RATE (₹/KG)     [ 200.00 ]

────── LIVE CALCULATION ──────
Total Kg:        5,000
Base Amount:     ₹10,00,000
──────────────────────────────

GST %           [ 5% ▼ ]                  ← dropdown: 0/5/12/18/28%
GST Amount:      ₹50,000                  ← auto-calculated
Total incl GST:  ₹10,50,000              ← auto-calculated

TRANSPORT (₹)   [ 5,000 ]                ← optional

────── GRAND TOTAL ──────
₹10,55,000
──────────────────────────────

CC DRAW DATE    [ __ ]                    ← optional, date picker
AMOUNT PAID     [ 0 ]                     ← direct payment at time of purchase

────── BALANCE DUE ──────
₹10,55,000
──────────────────────────────

[ REVIEW & SAVE ]
```

**On REVIEW & SAVE:** Show confirmation card summarizing the entire entry. User taps CONFIRM to save.

**After save:** "Purchase P047 saved. ₹10,55,000 from Rajendra Mills. Balance: ₹10,55,000 pending."
Offer: "Record CC draw?" / "Record payment?" / "Add another purchase"

---

### Sale Entry (`/sales/new`)

Same pattern as Purchase. Additional computed fields shown live:

```
────── MARGIN PREVIEW ──────
Avg Cost:        ₹200.00/kg    (?)
COGS:            ₹4,00,000
Broker Comm:     ₹100           (₹5 × 20 bags)
Gross Margin:    ₹37,900        (8.6%)     ← GREEN if positive, RED if negative
──────────────────────────────
```

**Margin Preview (?) explainer:** "This shows your estimated profit on this sale. Avg cost is calculated from all your purchases of this product. If margin is negative, you're selling below cost."

---

### Payment Entry (`/payments/new`)

```
DATE            [ 29-Mar-2026 ]
PARTY           [ Rajendra Mills ▼ ]        ← dropdown from all Contacts
DIRECTION       [ Paid ▼ ]                  ← Paid (to mills/brokers) / Received (from buyers)
AMOUNT (₹)      [ 5,00,000 ]

MODE            [ NEFT ▼ ]                  ← Cash/NEFT/UPI/Cheque/RTGS
AGAINST TXN     [ P047 ▼ ]                  ← dropdown of open txns for this party (optional)
REFERENCE       [ UTR12345 ]                ← free text
NOTES           [ ______________ ]

[ REVIEW & SAVE ]
```

**Against Txn dropdown:** Shows all purchases/sales for this party that have a pending balance. Format: "P047 — ₹10,55,000 due" or "S012 — ₹2,30,000 due". If left blank, payment is a general payment against the party.

---

### CC Ledger (`/cc-ledger`)

```
┌─ CC ACCOUNT LEDGER ───────────────────────────────────────┐
│                                                            │
│  Current Balance: ₹10,00,000    Limit: ₹50,00,000        │
│  ━━━━━━━━━━━ 20%                                          │
│                                                            │
│  [ + Draw ]    [ + Repay ]                                 │
│                                                            │
│  DATE        EVENT   AMOUNT      BALANCE     INTEREST      │
│  ──────────────────────────────────────────────────────    │
│  29-Mar      Draw    ₹10,00,000  ₹10,00,000  ₹4,219      │
│  15-Mar      Repay   ₹5,00,000   ₹0          ₹0          │
│  01-Mar      Draw    ₹5,00,000   ₹5,00,000   ₹2,055      │
│                                                            │
│  Calculated Interest Total: ₹6,274                         │
│  Actual Interest (PNB):     ₹6,000                         │
│  Difference:                ₹274                           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Interest column (?):** "Interest accrued during this period. Calculated as: balance × number of days at this balance × annual rate ÷ 365."

---

### Party Ledger (`/ledger`)

List view of all contacts with their balances.

```
┌─ PARTY LEDGER ────────────────────────────────────────────┐
│                                                            │
│  [ Filter: All ▼ ]  [ Search: ________ ]                  │
│                                                            │
│  ┌──────────────────────────────────────────┐              │
│  │ Rajendra Mills              MILL         │              │
│  │ Billed: ₹10,55,000  Paid: ₹5,00,000    │              │
│  │ Balance: ₹5,55,000  PAYABLE  ⚠️ 15 days │              │
│  └──────────────────────────────────────────┘              │
│                                                            │
│  ┌──────────────────────────────────────────┐              │
│  │ Ramesh Traders              BUYER        │              │
│  │ Billed: ₹4,62,000  Received: ₹3,00,000 │              │
│  │ Balance: ₹1,62,000  RECEIVABLE  ⚠️ 9d   │              │
│  └──────────────────────────────────────────┘              │
│                                                            │
│  ┌──────────────────────────────────────────┐              │
│  │ Suresh Broker              BROKER        │              │
│  │ Commission Due: ₹8,500  Paid: ₹0        │              │
│  │ Balance: ₹8,500  PAYABLE                 │              │
│  └──────────────────────────────────────────┘              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Tap on a party** → Drill-down showing all transactions with that party (purchases/sales + payments).

**Filter options:** All, Mills only, Buyers only, Brokers only, Overdue only.

---

### Contacts Master (`/contacts`)

CRUD list. Each contact card shows:
- Name, Type, Phone, City
- For Brokers: Commission type + value
- Quick stats: Total transactions, Current balance

**Add/Edit form:**
```
NAME            [ ______________ ]
TYPE            [ Mill ○  Buyer ○  Broker ○ ]
PHONE           [ ______________ ]
CITY            [ ______________ ]

── BROKER COMMISSION (only if Broker) ──
TYPE            [ Per Bag ○  Percentage ○ ]
VALUE           [ 5 ]  ← ₹5/bag or 2% depending on type

NOTES           [ ______________ ]

[ SAVE ]
```

---

### Products Master (`/products`)

CRUD list. Each product card shows:
- Full name, Active/Inactive badge
- Current inventory (bags + kg)
- Avg cost ₹/kg

**Add/Edit form:**
```
MILL/BRAND      [ ______________ ]
FIBRE TYPE      [ PC ▼ ]                    ← dropdown
COUNT           [ 30s ]
QUALITY         [ Top ▼ ]                   ← dropdown
ACTIVE          [ ✓ ]

Preview: "Rajendra Mills PC 30s Top"

[ SAVE ]
```

---

### Settings (`/settings`)

```
┌─ BUSINESS SETTINGS ───────────────────────────────────────┐
│                                                            │
│  CC Limit (₹)               [ 50,00,000 ]                │
│  CC Interest Rate (% p.a.)  [ 11.0 ]                     │
│  Default Kg per Bag          [ 100 ]                      │
│  Default GST Rate (%)        [ 5 ]                        │
│  Overdue Alert (days)        [ 30 ]                       │
│                                                            │
│  ── MONTHLY CC INTEREST (from PNB statement) ──           │
│                                                            │
│  Apr [ _______ ]   May [ _______ ]   Jun [ _______ ]     │
│  Jul [ _______ ]   Aug [ _______ ]   Sep [ _______ ]     │
│  Oct [ _______ ]   Nov [ _______ ]   Dec [ _______ ]     │
│  Jan [ _______ ]   Feb [ _______ ]   Mar [ _______ ]     │
│                                                            │
│  Total Actual Interest: ₹48,000                           │
│                                                            │
│  [ SAVE SETTINGS ]                                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### Tally Reconciliation (`/recon`)

```
┌─ TALLY RECONCILIATION ────────────────────────────────────┐
│                                                            │
│  Recon Date: [ 31-Mar-2026 ]                              │
│  Variance Threshold: [ ₹500 ]                             │
│                                                            │
│  [ Upload Tally Export (.xlsx / .csv) ]                    │
│  or                                                        │
│  [ Paste from Tally ]                                      │
│                                                            │
│  ── SUMMARY ──                                             │
│  Total Parties: 12   Matched: 8   Mismatch: 2            │
│  Minor Variance: 1   Not in Sheet: 1                      │
│  Total Difference: ₹15,230                                │
│                                                            │
│  ── DETAIL ──                                              │
│  TALLY NAME         TALLY BAL   SHEET BAL   DIFF  STATUS  │
│  ─────────────────────────────────────────────────────     │
│  Rajendra Mills     ₹5,55,000   ₹5,55,000   ₹0   ✅      │
│  Ramesh Traders     ₹1,70,000   ₹1,62,000   ₹8K  ⚠️      │
│  Unknown Party      ₹30,000     —            —    ❌      │
│                                                            │
│  [ Export Recon Report ]                                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Auto-match logic:**
1. Exact name match against Contacts
2. If no match, offer dropdown to manually map
3. Status: Matched (diff=0), Minor Variance (diff < threshold), Mismatch (diff >= threshold), Not in Sheet (no match)

---

## Mobile PWA Specifics

### Bottom Navigation (5 tabs)

```
[ 📊 Home ]  [ 📦 Buy ]  [ 💰 Sell ]  [ 💳 Pay ]  [ ≡ More ]
```

- **Home** = Dashboard
- **Buy** = Purchases list + FAB to add
- **Sell** = Sales list + FAB to add
- **Pay** = Payments list + FAB to add
- **More** = Ledger, CC Ledger, Contacts, Products, Settings, Recon

### Floating Action Button (FAB)

On list screens (Purchases, Sales, Payments): FAB "+" button in bottom-right to add new entry.

### Pull-to-Refresh

All list screens support pull-to-refresh.

### Offline Indicator

When offline, show a banner: "You're offline. Changes will sync when connected." Banner color: amber.

### Install Prompt

On first visit (mobile Chrome), show: "Add SYT to your home screen for quick access." with install button.

---

## Empty States

Every screen needs a helpful empty state (not just "No data"):

- **Dashboard (no data):** "Welcome! Start by adding your products and contacts, then record your first purchase."
- **Purchases (empty):** "No purchases yet. Tap + to record your first yarn purchase."
- **Ledger (empty):** "Your party ledger will appear here once you record purchases and sales."

---

## Loading States

- Skeleton screens for cards and lists (not spinners).
- Optimistic updates for form submissions (show the entry immediately, sync in background).

---

## Error States

- Form validation errors: Inline, below the field, in red.
- Network errors: Toast notification "Couldn't save. Saved offline — will sync automatically."
- Server errors: "Something went wrong. Try again." with retry button.

---

## Typography

| Element | Size | Weight |
|---------|------|--------|
| Dashboard metric value | 28px | Bold |
| Dashboard metric label | 14px | Regular |
| Card title | 18px | Semi-bold |
| Form field label | 14px | Medium |
| Form field value | 16px | Regular |
| Table header | 13px | Semi-bold |
| Table cell | 14px | Regular |
| Explainer text | 13px | Regular, italic |

Use system font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

---

## Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| < 640px | Mobile: single column, bottom nav, stacked cards |
| 640-1024px | Tablet: 2-column dashboard, sidebar nav |
| > 1024px | Desktop: 2-3 column dashboard, full sidebar |
