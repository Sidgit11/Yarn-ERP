# SYT ERP — Design & UX Guide

> Comprehensive design system and UX principles for building the SYT business management app.
> Target user: Sarthak — yarn trader, tier-2 city, WhatsApp-native, limited tech comfort.
> This document is the UX bible. Every screen, interaction, and micro-copy decision should trace back to a principle here.

---

## 1. Design Philosophy

### 1.1 The Khatabook Lesson

Khatabook didn't succeed by making traders into accountants. It digitized an existing habit — the paper khata (ledger). SYT must follow the same playbook: don't teach Sarthak new concepts, digitize how he already thinks about his business.

He already thinks in:
- **"Kitna maal hai?"** (How much stock?) → Inventory screen
- **"Kiski kitni baki hai?"** (Who owes how much?) → Ledger screen
- **"Kitna kamaya?"** (How much did I earn?) → Margin card
- **"CC pe kitna chadha hai?"** (How much is loaded on CC?) → CC position card

Mirror these mental models. Don't introduce ERP vocabulary.

### 1.2 Core UX Principles

**Principle 1: "If you can use WhatsApp, you can use SYT."**
OkCredit's benchmark — and ours. No feature should require more cognitive effort than sending a WhatsApp message. If it does, simplify it.

**Principle 2: Productivity over engagement.**
This is a work tool, not a social app. Get in, record the deal, see the numbers, get out. Optimize for speed-to-completion, not time-on-app. Target: record a purchase in under 60 seconds.

**Principle 3: No number without an explanation.**
Every metric on screen must be understandable by someone who has never used a computer beyond WhatsApp. Every number gets a (?) icon that explains it in plain Hindi-English business language.

**Principle 4: Forgive everything.**
Wrong input? Undo. Forgot a field? Save as draft. Fat-fingered the amount? Edit post-save. Never punish mistakes — make them easy to fix.

**Principle 5: Show the math.**
When displaying any calculated number (margin, interest, balance), show the calculation breakdown on tap. "₹37,900 = ₹4,40,000 sale − ₹4,00,000 cost − ₹5,000 transport − ₹100 broker." Transparency builds trust with a user who currently does mental math.

---

## 2. User Personas & Context

### 2.1 Primary Persona: Sarthak (The Trader)

| Attribute | Detail |
|-----------|--------|
| Age | 30-45 |
| Location | Tier-2 city (Surat/Ludhiana/Panipat) |
| Device | Android phone (mid-range, 6" screen), rarely uses laptop |
| Tech comfort | WhatsApp, YouTube, Google Pay, basic phone apps |
| Daily routine | On phone calls 4-6 hours, visiting godown, meeting buyers |
| Data entry context | Often while on a call with a buyer/supplier — one hand on phone, one hand free |
| Language | Hindi primary, reads English labels, mixes both |
| Pain point | Doesn't know his real margin until the accountant tells him quarterly |
| Trust barrier | "Will my data be safe?" "Will it match Tally?" |

### 2.2 Usage Context

Sarthak uses SYT in three distinct modes:

**Mode 1: Quick Entry (60% of usage)**
- While on a phone call or just after hanging up
- Standing in the godown, sitting in the office, or in the car
- Needs to record a deal in < 60 seconds
- One-handed operation, often distracted
- Priority: speed, large touch targets, minimal fields

**Mode 2: Morning Review (25% of usage)**
- 8-9 AM with chai, before calls start
- Sitting down, full attention, both hands free
- Wants the big picture: margins, balances, who to follow up with
- May use phone or laptop
- Priority: information density, drill-down capability

**Mode 3: Monthly Reconciliation (15% of usage)**
- End of month or when CA asks
- Needs to match with Tally, generate reports
- Likely on laptop/desktop for this
- Priority: accuracy, export capability, detailed views

### 2.3 Environment Constraints

- **Network:** Intermittent 4G in tier-2 cities. Must work offline for core functions.
- **Screen:** 6" Android phone. Design for 360px width minimum.
- **Brightness:** Often outdoors or in poorly lit godowns. High contrast required.
- **Noise:** Busy market environments. No audio-dependent interactions.
- **Interruptions:** Calls come in constantly. App must handle interruptions gracefully — never lose unsaved data.

---

## 3. Design System

### 3.1 Typography

| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| Page title | System sans | 24px | 700 (Bold) | 32px |
| Card title | System sans | 18px | 600 (Semi-bold) | 24px |
| Metric value (hero) | System sans | 32px | 700 (Bold) | 40px |
| Metric label | System sans | 14px | 400 (Regular) | 20px |
| Body text | System sans | 16px | 400 (Regular) | 24px |
| Form label | System sans | 14px | 500 (Medium) | 20px |
| Form input | System sans | 16px | 400 (Regular) | 24px |
| Helper/explainer text | System sans | 13px | 400 (Regular) | 18px |
| Table header | System sans | 13px | 600 (Semi-bold) | 18px |
| Table cell | System sans | 14px | 400 (Regular) | 20px |
| Button text | System sans | 16px | 600 (Semi-bold) | 24px |

**Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', sans-serif`

Include `Noto Sans` for Devanagari support (Phase 2 Hindi toggle).

**Rules:**
- Never go below 13px for any text. Sarthak may have imperfect vision.
- Metric values use 32px bold — they should be readable from arm's length.
- All caps ONLY for section headers inside cards (e.g., "CC ACCOUNT"). Never for body text.
- Numbers always use Indian number formatting: ₹10,50,000 (not ₹1,050,000). Use `Intl.NumberFormat('en-IN')`.

### 3.2 Color System

**Semantic Colors (per dashboard section):**

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-danger` | `#C0392B` | CC position, overdue amounts, negative margins |
| `--color-primary` | `#2980B9` | Money flow, receivables, links, primary actions |
| `--color-success` | `#27AE60` | Margins (positive), paid status, matched recon |
| `--color-inventory` | `#8E44AD` | Stock position |
| `--color-activity` | `#E67E22` | Quick stats, purchases, warnings |
| `--color-tax` | `#16A085` | GST, payments |

**Neutral Colors:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg` | `#FFFFFF` | Page background |
| `--color-surface` | `#F8F9FA` | Card background, input backgrounds |
| `--color-surface-alt` | `#EBF5FB` | Metric value backgrounds |
| `--color-border` | `#DEE2E6` | Card borders, dividers |
| `--color-text` | `#2C3E50` | Primary text |
| `--color-text-secondary` | `#6C757D` | Labels, helper text |
| `--color-text-muted` | `#ADB5BD` | Placeholders |
| `--color-header-bg` | `#1B4F72` | Section headers, nav bar |

**Status Colors:**

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Paid / Received | `#D5F5E3` | `#1E8449` | `#27AE60` |
| Partial | `#FEF9E7` | `#B7950B` | `#F1C40F` |
| Pending | `#FADBD8` | `#922B21` | `#E74C3C` |
| Overdue | `#F5B7B1` | `#922B21` | `#C0392B` (pulsing) |
| Clear | `#E8E8E8` | `#6C757D` | `#BDC3C7` |

**Contrast Requirements:**
- All text must meet WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Never use light grey text on white backgrounds.
- Status badges must be readable without relying on color alone — always include text label + icon.

### 3.3 Spacing & Layout

**Spacing scale:** 4px base unit. Use multiples: 4, 8, 12, 16, 20, 24, 32, 40, 48.

**Card spacing:**
- Card padding: 16px (mobile), 24px (desktop)
- Between cards: 12px (mobile), 16px (desktop)
- Card border-radius: 12px
- Card shadow: `0 1px 3px rgba(0,0,0,0.08)` (subtle, not dramatic)

**Touch targets:**
- Minimum 48×48px for all tappable elements (exceeds WCAG's 44px recommendation).
- Buttons: minimum height 48px, full-width on mobile.
- Form inputs: minimum height 48px.
- Space between tappable elements: minimum 8px.

### 3.4 Icons

Use [Lucide Icons](https://lucide.dev/) — clean, consistent, open source.

| Concept | Icon | Label always shown |
|---------|------|--------------------|
| Dashboard | `LayoutDashboard` | Yes — "Home" |
| Purchase | `PackagePlus` | Yes — "Buy" |
| Sale | `IndianRupee` | Yes — "Sell" |
| Payment | `CreditCard` | Yes — "Pay" |
| More menu | `Menu` | Yes — "More" |
| Add new | `Plus` | No (FAB) |
| Info/Explainer | `HelpCircle` | No (inline) |
| Warning | `AlertTriangle` | Context-dependent |
| Success | `CheckCircle` | Context-dependent |
| Edit | `Pencil` | Yes on desktop, no on mobile |
| Delete | `Trash2` | Yes, always |
| Filter | `Filter` | Yes on desktop |

**Rule:** Never use an icon without a text label in the bottom navigation. Icons alone fail for low-tech-comfort users. The only exception is the FAB (+) button, which is universally understood.

### 3.5 Motion & Animation

**Keep it minimal.** Animations should feel snappy, not playful.

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Page transition | Slide left/right | 200ms |
| Card expand/collapse | Accordion slide | 150ms |
| Modal/bottom sheet | Slide up from bottom | 250ms |
| Toast notification | Slide in from top | 200ms, auto-dismiss 4s |
| Loading skeleton | Pulse shimmer | Continuous |
| Save confirmation | Checkmark scale-in | 300ms |
| Number update | Count-up animation | 400ms (dashboard metrics only) |

**No animations for:** form inputs, dropdown selections, page scrolling, data table rendering.

---

## 4. User Journeys

### 4.1 Journey: First-Time Setup (Day 1)

**Goal:** Get Sarthak from install to first recorded transaction in under 10 minutes.

```
Step 1: Install PWA
├── User visits syt.app on Chrome
├── "Add to Home Screen" prompt appears
├── One tap → installed
└── Opens to login screen

Step 2: Phone OTP Login
├── Enter phone number
├── Receive OTP via SMS
├── Auto-read OTP (Web OTP API)
└── Logged in → Welcome screen

Step 3: Guided Setup (3 screens, skippable)
├── Screen 1: "Set up your CC account"
│   ├── CC Limit: [₹50,00,000] ← pre-filled
│   ├── Interest Rate: [11%] ← pre-filled
│   └── [Next] or [Skip — I'll do this later]
│
├── Screen 2: "Add your first contacts"
│   ├── "+ Add a Mill (supplier)"
│   ├── "+ Add a Buyer"
│   ├── "+ Add a Broker" (optional)
│   └── [Next] or [Skip]
│
├── Screen 3: "Add your first product"
│   ├── Quick form: Mill, Fibre, Count, Quality
│   └── [Done — Go to Dashboard]
│
└── Dashboard loads with helpful empty states

Step 4: First Transaction
├── Empty dashboard shows: "Record your first purchase to see your numbers here"
├── User taps "Buy" tab → Purchase form
├── Pre-fills available: kg/bag from config, GST from config
├── User fills: Product, Supplier, Qty, Rate
├── Live calculation shows totals
├── [Review & Save] → Confirmation card → [Confirm]
└── Dashboard now shows first data point
```

**Critical UX decisions:**
- Pre-fill everything possible. Don't make Sarthak configure before using.
- Setup is skippable. Let him record a transaction first, configure later.
- Empty states are instructional, not empty. Every blank screen says what to do next.
- The "aha moment" is seeing the dashboard populate after the first purchase+sale pair.

### 4.2 Journey: Recording a Purchase (Daily)

**Context:** Sarthak just hung up with Rajendra Mills. He agreed to buy 50 bags at ₹200/kg.

```
Time 0:00 — Opens app (already on Dashboard)
├── Taps "Buy" in bottom nav

Time 0:02 — Purchase form opens
├── Date: [Today] ← auto-filled
├── Taps Product dropdown → sees recent products first
│   └── Taps "Rajendra PC 30s Top"
├── Supplier auto-suggests "Rajendra Mills" (matched from product mill)
├── Qty: types "50"
├── Rate: types "200"
│   └── Live calculation appears:
│       "5,000 kg × ₹200 = ₹10,00,000"
│       "GST 5%: ₹50,000 | Total: ₹10,50,000"
├── Transport: types "5000"
│   └── Grand Total updates: "₹10,55,000"

Time 0:35 — Taps [Review & Save]
├── Confirmation card:
│   "Purchase P048
│    50 bags Rajendra PC 30s Top
│    5,000 kg × ₹200/kg
│    Base: ₹10,00,000 + GST: ₹50,000 + Transport: ₹5,000
│    Grand Total: ₹10,55,000
│    Supplier: Rajendra Mills"
├── [Confirm] or [Edit]

Time 0:40 — Taps [Confirm]
├── Success toast: "Purchase saved ✓"
├── Quick actions appear:
│   [+ Record CC Draw] [+ Record Payment] [+ New Purchase]

Time 0:45 — Done. Under 60 seconds.
```

**UX patterns at play:**
- **Smart defaults:** Date=today, kg/bag from config, GST from config
- **Smart suggestions:** Supplier suggested from product's mill field
- **Live calculation:** User sees totals updating as they type — no surprises
- **Confirmation before save:** Summary card prevents accidental saves
- **Post-save actions:** Contextual next steps (CC draw, payment) without forcing

### 4.3 Journey: Morning Review (Daily)

**Context:** 8 AM. Sarthak opens the app with his chai.

```
Opens app → Dashboard loads

Scan 1: CC Position (top of screen)
├── "₹10L outstanding, 20% used" → Healthy, moves on
├── If >80%: Red alert card, pulsing border

Scan 2: Where Is My Money?
├── Inventory: ₹6L, Receivables: ₹1.6L, Payables: ₹5.5L
├── Taps "Others Owe You" → Ledger filtered to Buyers
│   └── Sees Ramesh owes ₹1.6L for 9 days
│   └── Taps Ramesh → sees transaction detail
│   └── Mental note: "Call Ramesh today"
├── Back to Dashboard

Scan 3: Margins
├── Gross: ₹32,900 (7.5%), Net: ₹28,900 (6.6%)
├── Taps (?) on Net Margin → sees breakdown:
│   "Revenue ₹4.4L − COGS ₹4L − Transport ₹5K − Commission ₹2.1K − CC Interest ₹4K"
├── Satisfied. Knows exactly where money is going.

Scan 4: Quick Stats
├── 5 pending payments, 3 pending collections
├── Taps "Pending Collections" → filtered list

Total time: 3-5 minutes. Full business picture.
```

### 4.4 Journey: Recording a Payment

```
Opens app → Taps "Pay" tab → Payment form

Party: [Rajendra Mills ▼] ← dropdown, recent parties first
Direction: auto-sets to "Paid" (because Mills = supplier)
Amount: types "5L" → system interprets as ₹5,00,000
Mode: [NEFT ▼]
Against Txn: dropdown shows open transactions:
    "P048 — ₹10,55,000 due"
    "P045 — ₹3,20,000 due"
    ← Selects P048
Reference: types UTR number

[Review & Save] → Confirmation → [Confirm]

Dashboard updates: Rajendra Mills balance drops from ₹10.55L to ₹5.55L
Purchase P048 status changes from "Pending" to "Partial"
```

### 4.5 Journey: Tally Reconciliation (Monthly)

```
Opens app on laptop → navigates to /recon

Step 1: Export from Tally
├── On-screen instructions: "In Tally → Gateway → Display → Statements of Accounts → Sundry Debtors/Creditors → Export to Excel"

Step 2: Upload
├── Drags Excel file into upload zone
├── System parses: extracts Party Name, Balance, Type (Debtor/Creditor)

Step 3: Auto-Match
├── System matches Tally names to Contacts (exact match)
├── Unmatched parties shown with dropdown to manually map
├── User maps 2 unmatched names

Step 4: Review
├── Summary: "12 parties matched, 2 mismatches, ₹15,230 total difference"
├── Each row shows: Tally balance vs Sheet balance, difference, status
├── Status color-coded: ✅ Matched, ⚠️ Minor, ❌ Mismatch, ❓ Not Found

Step 5: Action
├── For mismatches: "Check if any payments were missed in either system"
├── [Export Recon Report] → downloads Excel for CA
```

### 4.6 Journey: Handling a Return (Rare)

```
Buyer Ramesh returns 5 bags of defective yarn.

Opens Sale form → enters negative quantity:
├── Product: [Rajendra PC 30s Top]
├── Buyer: [Ramesh Traders]
├── Qty: [-5] ← negative
├── Rate: same as original sale

System shows warning: "Negative quantity = Return. This will reduce inventory and adjust Ramesh's balance."

[Confirm Return]

All computed views automatically adjust:
├── Inventory: +5 bags (returned to stock)
├── Ramesh balance: reduced
├── Margin: adjusted
├── GST: adjusted
```

---

## 5. Component Patterns

### 5.1 Metric Card (Dashboard)

```
┌─────────────────────────────────────────┐
│  SECTION TITLE                          │  ← colored header bar
├─────────────────────────────────────────┤
│                                         │
│  Label                    Value    (?)  │  ← label left, value right, help icon
│  ─────────────────────────────────      │
│  Label                    Value    (?)  │
│  Label                    Value    (?)  │
│                                         │
│  ═══════════════════════════════════    │  ← divider before totals
│  TOTAL LABEL              ₹VALUE   (?)  │  ← bold, larger
│                                         │
│  [ View Details → ]                     │  ← optional drill-down link
│                                         │
└─────────────────────────────────────────┘
```

**Behavior:**
- Tap on any metric row → shows calculation breakdown (bottom sheet on mobile, tooltip on desktop)
- Tap (?) → shows plain-language explainer
- Tap "View Details" → navigates to relevant list screen
- Cards are collapsible on mobile (tap header to collapse/expand)

### 5.2 Explainer Bottom Sheet (Mobile)

```
┌─────────────────────────────────────────┐
│  ── drag handle ──                      │
│                                         │
│  Gross Margin                           │  ← title
│                                         │
│  What this means:                       │
│  How much you're making on your         │
│  trades after deducting cost, transport, │
│  and broker commission.                 │
│                                         │
│  How it's calculated:                   │
│  Sale Revenue         ₹4,40,000        │
│  − Cost of Goods      ₹4,00,000        │
│  − Transport           ₹5,000          │
│  − Broker Commission   ₹2,100          │
│  ─────────────────────────              │
│  = Gross Margin        ₹32,900         │
│                                         │
│  💡 This does NOT include CC interest.  │
│  See "Net Margin" for your true profit. │
│                                         │
│  [ Got it ]                             │
│                                         │
└─────────────────────────────────────────┘
```

**Rules for explainer copy:**
- First section: "What this means" — one sentence, no jargon
- Second section: "How it's calculated" — show the actual numbers as a math breakdown
- Third section: contextual tip — what to check if the number looks wrong, or what related metric to look at
- Use ₹ values from the user's actual data, not abstract formulas

### 5.3 Transaction List Item

```
┌─────────────────────────────────────────┐
│  P048  Rajendra PC 30s Top    29-Mar    │
│  Rajendra Mills  ·  50 bags  ·  ₹200/kg│
│  Grand Total: ₹10,55,000    [PARTIAL]   │
│  Balance: ₹5,55,000                     │
└─────────────────────────────────────────┘
```

**Rules:**
- Display ID (P048) always visible — it's how Sarthak refers to transactions
- Product name prominently placed
- Key numbers: total and balance
- Status badge color-coded
- Tap → full transaction detail
- Swipe right → quick "Record Payment" action (mobile)

### 5.4 Form Field

```
┌─ LABEL ──────────────────────────────────┐
│                                          │
│  [  Value                            ]   │  ← 48px height minimum
│                                          │
│  Helper text or validation error         │  ← 13px, grey or red
│                                          │
└──────────────────────────────────────────┘
```

**Rules:**
- Label always above the field (never floating/inside — confuses older users)
- Label stays visible even when field is focused
- Required fields: no asterisk. Instead, mark optional fields as "(optional)"
- Number fields: show ₹ prefix or "bags" suffix inline
- Error messages: appear inline below the field immediately, in red, with specific fix instruction ("Enter a number greater than 0")

### 5.5 Confirmation Card (Pre-Save)

```
┌─────────────────────────────────────────┐
│                                         │
│  ✓ Review Your Purchase                 │
│                                         │
│  Purchase P048                          │
│  ─────────────────────────              │
│  Product     Rajendra PC 30s Top        │
│  Supplier    Rajendra Mills             │
│  Quantity    50 bags × 100 kg = 5,000kg │
│  Rate        ₹200.00/kg                │
│  Base        ₹10,00,000                │
│  GST 5%      ₹50,000                   │
│  Transport   ₹5,000                    │
│  ─────────────────────────              │
│  GRAND TOTAL ₹10,55,000                │
│                                         │
│  [ ← Edit ]          [ Confirm ✓ ]     │
│                                         │
└─────────────────────────────────────────┘
```

### 5.6 Empty State

```
┌─────────────────────────────────────────┐
│                                         │
│         📦                              │
│                                         │
│  No purchases yet                       │
│                                         │
│  Record your first yarn purchase to     │
│  start tracking your inventory,         │
│  margins, and balances.                 │
│                                         │
│  [ + Add First Purchase ]               │
│                                         │
└─────────────────────────────────────────┘
```

**Rules:**
- Illustration/icon relevant to the screen (not generic)
- One sentence explaining what this screen does
- Single CTA button pointing to the logical next action
- Never show a completely blank screen

### 5.7 Toast / Notification

```
┌─────────────────────────────────────────┐
│  ✓  Purchase P048 saved                 │
└─────────────────────────────────────────┘
```

- Appears at top of screen
- Auto-dismisses in 4 seconds
- Includes undo action for destructive operations
- Green for success, red for error, amber for warning

---

## 6. Input Handling & Shortcuts

### 6.1 Smart Number Input

Sarthak thinks in lakhs and thousands, not raw digits.

| User types | System interprets | Display |
|-----------|------------------|---------|
| `5L` or `5l` | 500000 | ₹5,00,000 |
| `10.5L` | 1050000 | ₹10,50,000 |
| `50K` or `50k` | 50000 | ₹50,000 |
| `1050000` | 1050000 | ₹10,50,000 |
| `200` (in rate field) | 20000 (paise) | ₹200.00 |

Implement a `parseIndianAmount()` utility that handles L/K/Cr suffixes.

### 6.2 Recent-First Dropdowns

All entity dropdowns (Product, Contact) should show recently used items first, then alphabetical. The dropdown the user sees most often should require the fewest taps.

### 6.3 Smart Suggestions

When user selects a Product in Purchase form:
- If product's mill_brand matches a Mill contact → auto-suggest that contact in Supplier field
- Pre-fill GST rate from config
- Pre-fill kg/bag from config

When user selects a Party in Payment form:
- Auto-set Direction: Mill → "Paid", Buyer → "Received", Broker → "Paid"
- Show open transactions for this party in Against Txn dropdown

### 6.4 Draft Auto-Save

If the user leaves a form mid-entry (phone call comes in, app goes to background):
- Auto-save as draft in IndexedDB
- On return, show: "You have an unsaved purchase. Resume?" with [Resume] [Discard]
- Drafts persist across app restarts

---

## 7. Offline & PWA Behavior

### 7.1 Offline-First Architecture

| Feature | Offline behavior |
|---------|-----------------|
| View dashboard | Shows cached data with "Last updated: 5 min ago" |
| Record purchase/sale | Saves locally, queues for sync |
| Record payment | Saves locally, queues for sync |
| View ledger | Shows cached data |
| Add contact/product | Saves locally, queues for sync |
| Tally recon | Requires connection (file upload) |

### 7.2 Sync Indicator

```
┌─ Header Bar ────────────────────────────────┐
│  SYT                    ● Online  ↑2 queued │
└─────────────────────────────────────────────┘
```

- Green dot: connected and synced
- Amber dot + count: offline, N transactions queued
- Red dot: sync failed, tap to retry
- Show "Last synced: 2 min ago" on dashboard

### 7.3 Conflict Resolution

If the same transaction is edited on two devices (unlikely with single user, but good practice):
- Server wins for calculations
- Notify user: "This transaction was updated. Review?" with diff view
- Never silently overwrite user input

---

## 8. Accessibility Checklist

| Requirement | Implementation |
|------------|---------------|
| Font size minimum | 13px everywhere, 16px for form inputs |
| Touch target minimum | 48×48px for all tappable elements |
| Color contrast | WCAG AA (4.5:1 text, 3:1 large text) |
| Status communication | Never rely on color alone — always text + icon |
| Error messages | Inline, specific, actionable ("Enter qty in bags, e.g., 50") |
| Focus indicators | Visible focus ring on all interactive elements |
| Screen reader | Semantic HTML, ARIA labels on icons, form field associations |
| Keyboard navigation | All forms fully keyboard-navigable (desktop) |
| Reduced motion | Respect `prefers-reduced-motion` — disable animations |
| Zoom support | Usable at 200% zoom without horizontal scroll |

---

## 9. Responsive Layout Specifications

### 9.1 Mobile (< 640px)

```
┌───────────────────────┐
│  Header + Sync Status │
├───────────────────────┤
│                       │
│  [Dashboard Card 1]   │
│                       │
│  [Dashboard Card 2]   │
│                       │
│  [Dashboard Card 3]   │
│                       │
│  [Dashboard Card 4]   │
│                       │
│  ...                  │
│                       │
├───────────────────────┤
│ 📊  📦  💰  💳  ≡  │  ← bottom tab bar
└───────────────────────┘
```

- Single column, stacked cards
- Bottom tab navigation (fixed)
- FAB for add actions
- Full-screen forms
- Bottom sheets for modals

### 9.2 Tablet (640-1024px)

```
┌──────────────────────────────────┐
│  Header + Sync Status            │
├───────┬──────────────────────────┤
│       │                          │
│  Nav  │  [Card 1]   [Card 2]    │
│       │                          │
│       │  [Card 3]   [Card 4]    │
│       │                          │
│       │  [Card 5]   [Card 6]    │
│       │                          │
└───────┴──────────────────────────┘
```

- Collapsible sidebar navigation
- 2-column dashboard grid
- Side panels for forms (not full-screen)

### 9.3 Desktop (> 1024px)

```
┌────────────────────────────────────────────┐
│  Header + Sync Status                      │
├──────────┬─────────────────────────────────┤
│          │                                 │
│  Sidebar │  [Card 1]  [Card 2]  [Card 3]  │
│  Nav     │                                 │
│          │  [Card 4]  [Card 5]  [Card 6]  │
│  Always  │                                 │
│  Visible │  [Transaction List / Detail]    │
│          │                                 │
└──────────┴─────────────────────────────────┘
```

- Persistent sidebar (240px wide)
- 2-3 column dashboard grid
- Master-detail layout for lists (list on left, detail on right)
- Forms in side panels or inline

---

## 10. Micro-Copy Guidelines

### 10.1 Tone

- **Conversational**, not formal. "You owe Rajendra Mills ₹5.5L" not "Accounts payable: ₹5,50,000 to Rajendra Mills."
- **Hindi-English mix** where natural. "Baki" for balance is fine. Don't force pure English.
- **Encouraging**, not clinical. "Great — your margins are up 2% this month!" not "Margin increase: 2.0%."
- **Short.** If a label can be 3 words, don't make it 7.

### 10.2 Standard Labels

| Concept | Label (English) | Alt (Hindi-tinged) |
|---------|----------------|---------------------|
| Balance owed by buyer | "They owe you" | "Baki receivable" |
| Balance owed to mill | "You owe them" | "Baki payable" |
| Inventory | "Stock in hand" | "Maal in hand" |
| Margin | "Your profit" | "Margin" |
| CC Outstanding | "CC used" | "CC pe chadha hua" |
| Grand Total | "Total payable" | "Total dena hai" |
| Status: Paid | "Paid ✓" | — |
| Status: Partial | "Part paid" | — |
| Status: Pending | "Not paid" | — |

### 10.3 Error Messages

| Situation | Bad | Good |
|-----------|-----|------|
| Missing required field | "Field is required" | "Please enter the quantity in bags" |
| Invalid number | "Invalid input" | "Enter a number, e.g., 50" |
| Server error | "Error 500" | "Couldn't save. Your data is safe — try again." |
| Offline | "No network" | "You're offline. This will save when you reconnect." |
| Duplicate entry | "Duplicate detected" | "This looks like a duplicate of P047. Save anyway?" |

### 10.4 Success Messages

| Action | Message |
|--------|---------|
| Purchase saved | "Purchase P048 saved — ₹10,55,000 from Rajendra Mills" |
| Sale saved | "Sale S023 saved — ₹4,62,000 to Ramesh Traders. Margin: ₹37,900 (8.6%)" |
| Payment saved | "Payment saved — ₹5L paid to Rajendra Mills via NEFT. Balance now: ₹5,55,000" |
| CC Draw saved | "CC draw of ₹10L recorded. Balance: ₹10L (20% of limit)" |

**Always include:** the transaction ID, the amount, the party name, and the updated balance/metric. The user should never need to navigate elsewhere to confirm what just happened.

---

## 11. Performance Targets

| Metric | Target | Why |
|--------|--------|-----|
| First Contentful Paint | < 1.5s | User is impatient, might be on slow 4G |
| Time to Interactive | < 3s | Form must be usable quickly |
| Largest Contentful Paint | < 2.5s | Dashboard must render fast |
| Cumulative Layout Shift | < 0.1 | Numbers jumping around erodes trust |
| Bundle size (initial) | < 200KB (gzipped) | Low-end Android phones |
| Offline → Online sync | < 2s per transaction | Background, non-blocking |
| Form save (API) | < 500ms | Must feel instant |

---

## 12. Research Sources

This guide was informed by research from:

- [Enterprise UX Design Guide 2026](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/)
- [UX Design for Seniors](https://www.eleken.co/blog-posts/examples-of-ux-design-for-seniors)
- [Interface Design for Older Adults — Toptal](https://www.toptal.com/designers/ui/ui-design-for-older-adults)
- [Designing for Older Adults — Smashing Magazine](https://www.smashingmagazine.com/2024/02/guide-designing-older-adults/)
- [Usability for Senior Citizens — Nielsen Norman Group](https://www.nngroup.com/articles/usability-for-senior-citizens/)
- [PWA UX Tips 2025 — Lollypop](https://lollypop.design/blog/2025/september/progressive-web-app-ux-tips-2025/)
- [PWA Best Practices — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices)
- [How Khatabook Became the Premier Fintech for Bharat](https://ameya.substack.com/p/how-khatabook-became-the-premier)
- [Dashboard Design Principles — UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [UX Strategies for Real-Time Dashboards — Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [Form UI Design Best Practices — Designlab](https://designlab.com/blog/form-ui-design-best-practices)
- [Reduce Cognitive Load in Forms — NNG](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/)
- [Fintech UX Design Guide 2026](https://fuselabcreative.com/fintech-ux-design-guide-2026-user-experience/)
- [Financial Literacy in UX](https://www.numberanalytics.com/blog/financial-literacy-in-ux-for-finance)
- [Designing for Financial Behavior](https://www.elevenspace.co/blog/designing-for-financial-behavior-ux-that-builds-better-money-habits)
