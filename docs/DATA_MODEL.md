# SYT ERP — Data Model Reference

> Complete database schema derived from the working Excel tracker.
> Every formula and computed field is documented with its exact logic.
> Use Drizzle ORM for schema definition. PostgreSQL as the database.

---

## Schema Design Principles

1. **tenant_id on every table** — Single user now, but multi-tenant ready for Phase 2.
2. **Computed fields are NOT stored** — Calculate on read via SQL views or application logic. Exception: `running_balance` on CC entries is stored for performance.
3. **Soft deletes** — Add `deleted_at` timestamp. Never hard delete transactions.
4. **Audit trail** — `created_at`, `updated_at` on all tables.
5. **All monetary values stored as integers (paise)** — ₹10,50,000 stored as `10500000`. Avoids floating point issues. Display divides by 100.

---

## Tables

### config

Single row per tenant. All business defaults.

```
config
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── cc_limit                    INTEGER (paise)          -- default: 5000000_00 (₹50L)
├── cc_interest_rate_bps        INTEGER (basis points)   -- default: 1100 (11.00%)
├── default_kg_per_bag          INTEGER                  -- default: 100
├── default_gst_rate_bps        INTEGER (basis points)   -- default: 500 (5.00%)
├── overdue_days_threshold      INTEGER                  -- default: 30
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

### cc_interest_monthly

Monthly actual CC interest from PNB statement. 12 rows per financial year.

```
cc_interest_monthly
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── financial_year              TEXT        -- e.g., "2025-26"
├── month                       TEXT        -- "Apr", "May", ... "Mar"
├── month_index                 INTEGER     -- 1 (Apr) to 12 (Mar)
├── actual_interest             INTEGER (paise) -- from PNB statement
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

### contacts

Mills, Buyers, Brokers. Used for dropdowns everywhere.

```
contacts
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── name                        TEXT, NOT NULL
├── type                        ENUM('Mill', 'Buyer', 'Broker')
├── phone                       TEXT
├── city                        TEXT
├── broker_commission_type      ENUM('per_bag', 'percentage'), NULLABLE
│                               -- only relevant for Broker type
├── broker_commission_value     INTEGER
│                               -- paise if per_bag (e.g., 500 = ₹5/bag)
│                               -- basis points if percentage (e.g., 200 = 2%)
├── notes                       TEXT
├── deleted_at                  TIMESTAMP, NULLABLE
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

### products

Yarn product catalog.

```
products
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── mill_brand                  TEXT, NOT NULL    -- e.g., "Rajendra Mills"
├── fibre_type                  ENUM('PC', 'Cotton', 'Polyester', 'Viscose', 'Nylon', 'Acrylic', 'Blended')
├── count                       TEXT              -- e.g., "30s", "40s"
├── quality_grade               ENUM('Top', 'Standard', 'Economy')
├── full_name                   TEXT, GENERATED   -- "{mill_brand} {fibre_type} {count} {quality_grade}"
├── active                      BOOLEAN, DEFAULT true
├── deleted_at                  TIMESTAMP, NULLABLE
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

### purchases

Buying yarn from mills.

```
purchases
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── display_id                  TEXT, GENERATED   -- "P001", "P002", etc. (sequential per tenant)
├── date                        DATE, NOT NULL
├── product_id                  UUID, FK → products
├── lot_no                      TEXT
├── supplier_id                 UUID, FK → contacts (type = Mill)
├── via_broker                  BOOLEAN, DEFAULT false
├── broker_id                   UUID, FK → contacts (type = Broker), NULLABLE
├── qty_bags                    INTEGER, NOT NULL
├── kg_per_bag                  INTEGER           -- defaults from config, override-able
├── rate_per_kg                 INTEGER (paise)   -- e.g., 20000 = ₹200.00/kg
├── gst_pct_bps                 INTEGER (basis points) -- 0, 500, 1200, 1800, 2800
├── transport                   INTEGER (paise), DEFAULT 0
├── cc_draw_date                DATE, NULLABLE    -- if funded via CC draw
├── amount_paid                 INTEGER (paise), DEFAULT 0
│                               -- direct payment at time of purchase
├── deleted_at                  TIMESTAMP, NULLABLE
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

**Computed fields (calculate on read):**

| Field | Formula | Excel Reference |
|-------|---------|----------------|
| `total_kg` | `qty_bags × kg_per_bag` | PURCHASES!K = H × I |
| `base_amount` | `total_kg × rate_per_kg` | PURCHASES!L = K × J |
| `gst_amount` | `base_amount × gst_pct / 10000` | PURCHASES!N = L × M |
| `total_incl_gst` | `base_amount + gst_amount` | PURCHASES!O = L + N |
| `grand_total` | `total_incl_gst + transport` | PURCHASES!Q = O + P |
| `linked_payments` | `SUM(payments.amount WHERE party = supplier AND against_txn = this.display_id)` | SUMPRODUCT in PURCHASES!T |
| `balance_due` | `grand_total - amount_paid - linked_payments` | PURCHASES!T |
| `status` | `balance <= 0 → "Paid", balance < grand_total → "Partial", else "Pending"` | PURCHASES!U |

### sales

Selling yarn to buyers.

```
sales
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── display_id                  TEXT, GENERATED   -- "S001", "S002", etc.
├── date                        DATE, NOT NULL
├── product_id                  UUID, FK → products
├── buyer_id                    UUID, FK → contacts (type = Buyer)
├── via_broker                  BOOLEAN, DEFAULT false
├── broker_id                   UUID, FK → contacts (type = Broker), NULLABLE
├── qty_bags                    INTEGER, NOT NULL
├── kg_per_bag                  INTEGER
├── rate_per_kg                 INTEGER (paise)
├── gst_pct_bps                 INTEGER (basis points)
├── transport                   INTEGER (paise), DEFAULT 0
├── amount_received             INTEGER (paise), DEFAULT 0
├── deleted_at                  TIMESTAMP, NULLABLE
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

**Computed fields:**

| Field | Formula | Excel Reference |
|-------|---------|----------------|
| `total_kg` | `qty_bags × kg_per_bag` | SALES!J = G × H |
| `base_amount` | `total_kg × rate_per_kg` | SALES!K = J × I |
| `gst_amount` | `base_amount × gst_pct / 10000` | SALES!M = K × L |
| `total_incl_gst` | `base_amount + gst_amount` | SALES!N = K + M |
| `avg_cost_per_kg` | `SUM(purchases.base_amount WHERE product matches) / SUM(purchases.total_kg WHERE product matches)` | SALES!P — weighted avg across ALL purchases |
| `cogs` | `avg_cost_per_kg × total_kg` | SALES!Q = P × J |
| `broker_commission` | See commission logic below | SALES!R |
| `gross_margin` | `base_amount - cogs - transport - broker_commission` | SALES!S = K - Q - O - R |
| `gross_margin_pct` | `gross_margin / base_amount` | SALES!T = S / K |
| `linked_payments` | `SUM(payments.amount WHERE party = buyer AND against_txn = this.display_id)` | SUMPRODUCT in SALES!V |
| `balance_receivable` | `total_incl_gst - amount_received - linked_payments` | SALES!V |
| `status` | `balance <= 0 → "Received", balance < total_incl_gst → "Partial", else "Pending"` | SALES!W |

**Broker Commission Logic:**
```sql
CASE
  WHEN via_broker = false THEN 0
  WHEN broker.commission_type = 'per_bag' THEN qty_bags × broker.commission_value
  WHEN broker.commission_type = 'percentage' THEN base_amount × broker.commission_value / 10000
  ELSE 0
END
```

### payments

All cash movements — paying mills, receiving from buyers, paying brokers.

```
payments
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── date                        DATE, NOT NULL
├── party_id                    UUID, FK → contacts
├── direction                   ENUM('Paid', 'Received')
├── amount                      INTEGER (paise), NOT NULL
├── mode                        ENUM('Cash', 'NEFT', 'UPI', 'Cheque', 'RTGS')
├── against_txn_id              TEXT, NULLABLE
│                               -- "P001" links to purchase, "S001" links to sale
│                               -- NULL = general payment not linked to specific txn
├── reference                   TEXT              -- cheque no, UTR, etc.
├── notes                       TEXT
├── deleted_at                  TIMESTAMP, NULLABLE
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

### cc_entries

Cash Credit account ledger — draws and repayments.

```
cc_entries
├── id                          UUID, PK
├── tenant_id                   UUID, FK → tenant
├── date                        DATE, NOT NULL
├── event                       ENUM('Draw', 'Repay')
├── amount                      INTEGER (paise), NOT NULL
├── running_balance             INTEGER (paise)
│                               -- stored, updated on insert:
│                               -- Draw: prev_balance + amount
│                               -- Repay: prev_balance - amount
├── notes                       TEXT
├── created_at                  TIMESTAMP
└── updated_at                  TIMESTAMP
```

**Interest Calculation (daily accrual):**
```sql
-- For each CC entry:
-- days = COALESCE(next_entry.date, CURRENT_DATE) - this_entry.date
-- interest = running_balance × days × annual_rate / 365 / 10000 (rate in bps)
-- Total calculated interest = SUM across all entries

SELECT SUM(
  cc.running_balance *
  (COALESCE(LEAD(cc.date) OVER (ORDER BY cc.date, cc.id), CURRENT_DATE) - cc.date) *
  config.cc_interest_rate_bps / 365 / 10000
) as calculated_interest
FROM cc_entries cc
JOIN config ON cc.tenant_id = config.tenant_id
```

---

## Computed Views (SQL or application-level)

### Party Ledger View

Per-contact aggregation. Maps to Excel LEDGER tab.

```sql
-- For Mills:
total_billed = SUM(purchases.grand_total WHERE supplier = contact)
total_paid = SUM(purchases.amount_paid WHERE supplier = contact)
           + SUM(payments.amount WHERE party = contact AND direction = 'Paid')

-- For Buyers:
total_billed = SUM(sales.total_incl_gst WHERE buyer = contact)
total_received = SUM(sales.amount_received WHERE buyer = contact)
              + SUM(payments.amount WHERE party = contact AND direction = 'Received')

-- For Brokers:
total_billed = sale_commission + purchase_commission (see LEDGER formulas)
total_paid = SUM(payments.amount WHERE party = contact AND direction = 'Paid')

-- Net balance = total_billed - total_paid_or_received
-- Direction: Mill → Payable/Overpaid, Buyer → Receivable/Overpaid, Broker → Payable/Overpaid
```

### Dashboard Metrics View

Maps to Excel DASHBOARD tab. All formulas documented in `IMPLEMENTATION.md` Section 3.3.

### Inventory View

```sql
SELECT
  p.full_name,
  SUM(pu.qty_bags) - COALESCE(SUM(s.qty_bags), 0) as bags_in_hand,
  SUM(pu.total_kg) - COALESCE(SUM(s.total_kg), 0) as kg_in_hand
FROM products p
LEFT JOIN purchases pu ON pu.product_id = p.id
LEFT JOIN sales s ON s.product_id = p.id
GROUP BY p.id, p.full_name
HAVING bags_in_hand > 0
```

---

## Indexes

```sql
-- High-frequency lookups
CREATE INDEX idx_purchases_product ON purchases(product_id);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_sales_product ON sales(product_id);
CREATE INDEX idx_sales_buyer ON sales(buyer_id);
CREATE INDEX idx_payments_party ON payments(party_id);
CREATE INDEX idx_payments_against_txn ON payments(against_txn_id);
CREATE INDEX idx_cc_entries_date ON cc_entries(date);

-- Tenant isolation
CREATE INDEX idx_purchases_tenant ON purchases(tenant_id);
CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
```

---

## Seed Data

Use the sample data from the Excel tracker for development:

**Products:** Rajendra Mills PC 30s Top, Rajendra Mills PC 40s Standard, Vardhman Textiles Cotton 30s Top

**Contacts:** Rajendra Mills (Mill), Vardhman Textiles (Mill), Ramesh Traders (Buyer), Mahesh & Co (Buyer), Suresh Broker (Broker, ₹5/bag)

**Config:** CC Limit ₹50L, Rate 11%, Kg/Bag 100, GST 5%, Overdue 30 days
