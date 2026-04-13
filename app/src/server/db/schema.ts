import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const contactTypeEnum = pgEnum("contact_type", ["Mill", "Buyer", "Broker", "Transporter"]);
export const brokerCommissionTypeEnum = pgEnum("broker_commission_type", ["per_bag", "percentage"]);
export const fibreTypeEnum = pgEnum("fibre_type", ["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"]);
export const qualityGradeEnum = pgEnum("quality_grade", ["Top", "Standard", "Economy"]);
export const paymentDirectionEnum = pgEnum("payment_direction", ["Paid", "Received"]);
export const paymentModeEnum = pgEnum("payment_mode", ["Cash", "NEFT", "UPI", "Cheque", "RTGS"]);
export const ccEventEnum = pgEnum("cc_event", ["Draw", "Repay"]);

// Users table (for auth)
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Config - single row per tenant
export const config = pgTable("config", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  ccLimit: numeric("cc_limit", { precision: 14, scale: 2 }).default("5000000.00").notNull(),
  ccInterestRate: numeric("cc_interest_rate", { precision: 5, scale: 2 }).default("11.00").notNull(),
  defaultKgPerBag: numeric("default_kg_per_bag", { precision: 8, scale: 2 }).default("100").notNull(),
  defaultGstRate: numeric("default_gst_rate", { precision: 5, scale: 2 }).default("5.00").notNull(),
  overdueDaysThreshold: integer("overdue_days_threshold").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CC Interest Monthly - 12 rows per financial year
export const ccInterestMonthly = pgTable("cc_interest_monthly", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  financialYear: text("financial_year").notNull(), // "2025-26"
  month: text("month").notNull(), // "Apr", "May", etc.
  monthIndex: integer("month_index").notNull(), // 1 (Apr) to 12 (Mar)
  actualInterest: numeric("actual_interest", { precision: 14, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contacts - Mills, Buyers, Brokers
export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  type: contactTypeEnum("type").notNull(),
  phone: text("phone"),
  city: text("city"),
  gstin: text("gstin"),
  email: text("email"),
  creditTermDays: integer("credit_term_days"),
  bankAccountNo: text("bank_account_no"),
  bankIfsc: text("bank_ifsc"),
  bankName: text("bank_name"),
  creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }),
  brokerCommissionType: brokerCommissionTypeEnum("broker_commission_type"),
  brokerCommissionValue: numeric("broker_commission_value", { precision: 14, scale: 2 }),
  transporterRatePerBag: numeric("transporter_rate_per_bag", { precision: 14, scale: 2 }),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_contacts_tenant").on(table.tenantId),
  index("idx_contacts_type").on(table.type),
]);

// Products - Yarn catalog
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  millBrand: text("mill_brand").notNull(),
  fibreType: fibreTypeEnum("fibre_type").notNull(),
  count: text("count").notNull(), // "30s", "40s"
  qualityGrade: qualityGradeEnum("quality_grade").notNull(),
  hsnCode: text("hsn_code"),
  colorShade: text("color_shade"),
  active: boolean("active").default(true).notNull(),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_products_tenant").on(table.tenantId),
]);

// Purchases - Buying yarn from mills
export const purchases = pgTable("purchases", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  displayId: text("display_id").notNull(), // "P001", "P002"
  date: date("date").notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  lotNo: text("lot_no"),
  supplierId: uuid("supplier_id").references(() => contacts.id).notNull(),
  viaBroker: boolean("via_broker").default(false).notNull(),
  brokerId: uuid("broker_id").references(() => contacts.id),
  transporterId: uuid("transporter_id").references(() => contacts.id),
  qtyBags: integer("qty_bags").notNull(),
  kgPerBag: numeric("kg_per_bag", { precision: 8, scale: 2 }).notNull(),
  ratePerKg: numeric("rate_per_kg", { precision: 14, scale: 2 }).notNull(),
  gstPct: numeric("gst_pct", { precision: 5, scale: 2 }).notNull(),
  transport: numeric("transport", { precision: 14, scale: 2 }).default("0.00").notNull(),
  ccDrawDate: date("cc_draw_date"),
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).default("0.00").notNull(),
  supplierInvoiceNo: text("supplier_invoice_no"),
  dueDate: date("due_date"),
  financialYear: text("financial_year"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_purchases_tenant").on(table.tenantId),
  index("idx_purchases_product").on(table.productId),
  index("idx_purchases_supplier").on(table.supplierId),
  uniqueIndex("uq_purchases_tenant_display").on(table.tenantId, table.displayId),
]);

// Sales - Selling yarn to buyers
export const sales = pgTable("sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  displayId: text("display_id").notNull(), // "S001", "S002"
  date: date("date").notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  buyerId: uuid("buyer_id").references(() => contacts.id).notNull(),
  viaBroker: boolean("via_broker").default(false).notNull(),
  brokerId: uuid("broker_id").references(() => contacts.id),
  transporterId: uuid("transporter_id").references(() => contacts.id),
  qtyBags: integer("qty_bags").notNull(),
  kgPerBag: numeric("kg_per_bag", { precision: 8, scale: 2 }).notNull(),
  ratePerKg: numeric("rate_per_kg", { precision: 14, scale: 2 }).notNull(),
  gstPct: numeric("gst_pct", { precision: 5, scale: 2 }).notNull(),
  transport: numeric("transport", { precision: 14, scale: 2 }).default("0.00").notNull(),
  amountReceived: numeric("amount_received", { precision: 14, scale: 2 }).default("0.00").notNull(),
  ourInvoiceNo: text("our_invoice_no"),
  paymentTermType: text("payment_term_type"), // "advance" | "days"
  paymentTermDays: integer("payment_term_days"), // e.g. 15, 30, 45
  dueDate: date("due_date"), // auto-computed: sale date + paymentTermDays
  financialYear: text("financial_year"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_sales_tenant").on(table.tenantId),
  index("idx_sales_product").on(table.productId),
  index("idx_sales_buyer").on(table.buyerId),
  uniqueIndex("uq_sales_tenant_display").on(table.tenantId, table.displayId),
]);

// Payments - All cash movements
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  date: date("date").notNull(),
  partyId: uuid("party_id").references(() => contacts.id).notNull(),
  direction: paymentDirectionEnum("direction").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  againstTxnId: text("against_txn_id"), // "P001" or "S001"
  viaCC: boolean("via_cc").default(false).notNull(),
  reference: text("reference"),
  notes: text("notes"),
  financialYear: text("financial_year"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_payments_tenant").on(table.tenantId),
  index("idx_payments_party").on(table.partyId),
  index("idx_payments_against_txn").on(table.againstTxnId),
]);

// CC Entries - Cash Credit ledger
export const ccEntries = pgTable("cc_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  date: date("date").notNull(),
  event: ccEventEnum("event").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  runningBalance: numeric("running_balance", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cc_entries_tenant").on(table.tenantId),
  index("idx_cc_entries_date").on(table.date),
]);

// Rate Change Log - tracks when broker/transporter rates are changed
export const rateChangeLog = pgTable("rate_change_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id).notNull(),
  fieldChanged: text("field_changed").notNull(), // "brokerCommissionType", "brokerCommissionValue", "transporterRatePerBag"
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_rate_change_log_contact").on(table.contactId),
]);

// ============================================================
// Relations
// ============================================================

export const purchasesRelations = relations(purchases, ({ one }) => ({
  product: one(products, {
    fields: [purchases.productId],
    references: [products.id],
  }),
  supplier: one(contacts, {
    fields: [purchases.supplierId],
    references: [contacts.id],
    relationName: "purchaseSupplier",
  }),
  broker: one(contacts, {
    fields: [purchases.brokerId],
    references: [contacts.id],
    relationName: "purchaseBroker",
  }),
  transporter: one(contacts, {
    fields: [purchases.transporterId],
    references: [contacts.id],
    relationName: "purchaseTransporter",
  }),
}));

export const salesRelations = relations(sales, ({ one }) => ({
  product: one(products, {
    fields: [sales.productId],
    references: [products.id],
  }),
  buyer: one(contacts, {
    fields: [sales.buyerId],
    references: [contacts.id],
    relationName: "saleBuyer",
  }),
  broker: one(contacts, {
    fields: [sales.brokerId],
    references: [contacts.id],
    relationName: "saleBroker",
  }),
  transporter: one(contacts, {
    fields: [sales.transporterId],
    references: [contacts.id],
    relationName: "saleTransporter",
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  party: one(contacts, {
    fields: [payments.partyId],
    references: [contacts.id],
    relationName: "paymentParty",
  }),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  purchasesAsSupplier: many(purchases, { relationName: "purchaseSupplier" }),
  purchasesAsBroker: many(purchases, { relationName: "purchaseBroker" }),
  purchasesAsTransporter: many(purchases, { relationName: "purchaseTransporter" }),
  salesAsBuyer: many(sales, { relationName: "saleBuyer" }),
  salesAsBroker: many(sales, { relationName: "saleBroker" }),
  salesAsTransporter: many(sales, { relationName: "saleTransporter" }),
  paymentsAsParty: many(payments, { relationName: "paymentParty" }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  purchases: many(purchases),
  sales: many(sales),
}));
