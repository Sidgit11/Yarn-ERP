import "dotenv/config";
import { db } from "./index";
import { sql } from "drizzle-orm";

async function applySchema() {
  console.log("Applying schema changes...\n");

  const statements = [
    // Add email column to users (if not exists)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE`,
    // Make phone nullable
    `ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`,
    // Add unique constraint on display_id per tenant (purchases)
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_purchases_tenant_display ON purchases (tenant_id, display_id)`,
    // Add unique constraint on display_id per tenant (sales)
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_display ON sales (tenant_id, display_id)`,
    // Add tenant index on cc_entries
    `CREATE INDEX IF NOT EXISTS idx_cc_entries_tenant ON cc_entries (tenant_id)`,
    // Add lot_no and cc_draw_date to purchases
    `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS lot_no TEXT`,
    `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS cc_draw_date DATE`,
    // Add via_cc to payments for CC integration
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS via_cc BOOLEAN DEFAULT FALSE NOT NULL`,
  ];

  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log("OK:", stmt.substring(0, 80));
    } catch (err: any) {
      console.log("SKIP:", stmt.substring(0, 80), "—", err.message?.substring(0, 60));
    }
  }

  console.log("\nSchema changes applied.");
  process.exit(0);
}

applySchema().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
