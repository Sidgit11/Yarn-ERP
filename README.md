# TradeTexPro — Yarn Trading ERP

A modern web-based ERP for yarn trading businesses. Built to digitize the daily workflow of traders who currently rely on Excel sheets, mental math, and Tally.

> **Three questions this system answers every morning:**
> 1. Where is my money? — inventory + receivables + payables + CC position
> 2. What am I actually making? — true margins after CC interest, transport, broker commission
> 3. Who owes me what? — party-wise ledger with aging

---

## Features

- **Dashboard** — 6 metric cards: CC Account, Where Is My Money, GST Position, Profit, Stock in Hand, Quick Stats
- **Purchases** — Record yarn purchases from mills with auto-calculated totals, GST, broker commission
- **Sales** — Record sales to buyers with weighted-average COGS and live margin preview
- **Payments** — Track money in/out, link payments to specific transactions
- **CC Ledger** — Cash Credit account with running balance and daily-accrual interest calculation
- **Party Ledger** — Per-contact balances with aging
- **Tally Reconciliation** — Match against Tally export, spot variances
- **Bulk Import / Export** — Excel-based import for contacts, products, purchases, sales
- **Guided Onboarding Tour** — 10-step walkthrough for new users
- **Demo Account** — `demo@syt.app` / `demo123` with pre-loaded sample data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API routes, tRPC 11 (end-to-end type-safe API) |
| Database | PostgreSQL (Supabase), Drizzle ORM |
| Authentication | NextAuth.js (credentials, JWT sessions) |
| Forms & Validation | React Hook Form, Zod |
| Money Math | Decimal.js (avoids floating-point errors) |
| Hosting | Vercel (auto-deploy from main) |
| Icons | Lucide React |
| Notifications | Sonner |

## Project Structure

```
.
├── app/                    # Next.js application (main codebase)
│   ├── src/
│   │   ├── app/            # App Router pages (dashboard, login, api)
│   │   ├── components/     # Shared React components
│   │   ├── lib/            # Utilities, tRPC client, constants
│   │   └── server/
│   │       ├── auth.ts     # NextAuth configuration
│   │       ├── db/         # Drizzle schema, migrations, seed scripts
│   │       ├── services/   # Business logic (calculations.ts)
│   │       └── trpc/       # tRPC routers (purchases, sales, payments, etc.)
│   ├── public/
│   ├── package.json
│   └── next.config.ts
├── docs/                   # Specification & design documents
│   ├── DATA_MODEL.md       # Database schema reference
│   ├── DESIGN_UX_GUIDE.md  # UX principles & design system
│   ├── IMPLEMENTATION.md   # Implementation specification
│   ├── UI_UX_SPEC.md       # Screen-by-screen UI specs
│   └── UX_REVIEW_TASKS.md  # UX review task list
├── README.md
└── LICENSE
```

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database (Supabase, Neon, or local)

### Setup
```bash
cd app
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and NEXTAUTH_SECRET

# Apply schema
npx tsx src/server/db/apply-schema.ts

# Seed demo data (optional)
npm run db:seed-demo

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the demo account or create your own.

### Available Scripts
| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |
| `npm run db:seed` | Basic seed |
| `npm run db:seed-demo` | Rich demo data (idempotent) |

## Documentation

Detailed specs and design docs live in [`/docs`](./docs):
- [Data Model](./docs/DATA_MODEL.md) — Complete database schema with computed fields
- [Implementation](./docs/IMPLEMENTATION.md) — Implementation specification
- [Design & UX Guide](./docs/DESIGN_UX_GUIDE.md) — Design system, principles, user journeys
- [UI/UX Spec](./docs/UI_UX_SPEC.md) — Screen-by-screen specifications

## Live Demo

Visit the deployed app and click "Try Demo" on the login page to explore with pre-loaded sample data.

## License

MIT — see [LICENSE](./LICENSE)
