import "dotenv/config";
import { db } from "./index";
import {
  users,
  config,
  contacts,
  products,
  purchases,
  sales,
  payments,
  ccEntries,
} from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedSarthak() {
  console.log("=== Seeding Sarthak's demo data ===\n");

  // ── 1. User ──────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("sarthak123", 10);

  let tenantId: string;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, "sarthak2mundra@gmail.com"))
    .then((rows) => rows[0]);

  if (existingUser) {
    tenantId = existingUser.id;
    console.log("User already exists, reusing:", tenantId);
  } else {
    const [user] = await db
      .insert(users)
      .values({
        email: "sarthak2mundra@gmail.com",
        phone: null,
        passwordHash,
        name: "Sarthak Mundra",
      })
      .returning();
    tenantId = user.id;
    console.log("Created user 'Sarthak Mundra':", tenantId);
  }

  // ── 2. Config ────────────────────────────────────────────
  const existingConfig = await db
    .select()
    .from(config)
    .where(eq(config.tenantId, tenantId))
    .then((rows) => rows[0]);

  if (!existingConfig) {
    await db.insert(config).values({
      tenantId,
      ccLimit: "5000000.00",
      ccInterestRate: "11.00",
      defaultKgPerBag: 100,
      defaultGstRate: "5.00",
      overdueDaysThreshold: 30,
    });
    console.log("Created config (CC limit ₹50L, GST 5%, interest 11%)");
  } else {
    console.log("Config already exists, skipping");
  }

  // ── 3. Contacts ──────────────────────────────────────────

  // Mill
  const [mill] = await db
    .insert(contacts)
    .values({
      tenantId,
      name: "Vardhman Spinning Mill",
      type: "Mill",
      phone: "9876500001",
      city: "Ludhiana",
      notes: "Demo mill — Vardhman is one of the largest yarn producers",
    })
    .returning();
  console.log("Created Mill contact:", mill.name);

  // Buyer
  const [buyer] = await db
    .insert(contacts)
    .values({
      tenantId,
      name: "Raj Textiles",
      type: "Buyer",
      phone: "9876500002",
      city: "Surat",
      notes: "Demo buyer — regular weaving unit in Surat",
    })
    .returning();
  console.log("Created Buyer contact:", buyer.name);

  // Broker
  const [broker] = await db
    .insert(contacts)
    .values({
      tenantId,
      name: "Sharma Brokers",
      type: "Broker",
      phone: "9876500003",
      city: "Mumbai",
      brokerCommissionType: "per_bag",
      brokerCommissionValue: "5.00",
      notes: "Demo broker — ₹5 per bag commission",
    })
    .returning();
  console.log("Created Broker contact:", broker.name);

  // Transporter
  const [transporter] = await db
    .insert(contacts)
    .values({
      tenantId,
      name: "Krishna Transport",
      type: "Transporter",
      phone: "9876500004",
      city: "Ahmedabad",
      transporterRatePerBag: "15.00",
      notes: "Demo transporter — ₹15 per bag",
    })
    .returning();
  console.log("Created Transporter contact:", transporter.name);

  // ── 4. Product ───────────────────────────────────────────
  const [product] = await db
    .insert(products)
    .values({
      tenantId,
      millBrand: "Vardhman",
      fibreType: "Polyester",
      count: "30s",
      qualityGrade: "Top",
    })
    .returning();
  console.log("Created Product:", `${product.millBrand} ${product.fibreType} ${product.count} ${product.qualityGrade}`);

  // ── 5. Purchase ──────────────────────────────────────────
  // 20 bags x 100 kg/bag x ₹150/kg = ₹3,00,000 base + 5% GST = ₹3,15,000
  const [purchase] = await db
    .insert(purchases)
    .values({
      tenantId,
      displayId: "P001",
      date: "2026-03-15",
      productId: product.id,
      lotNo: "LOT-2026-001",
      supplierId: mill.id,
      viaBroker: true,
      brokerId: broker.id,
      qtyBags: 20,
      kgPerBag: 100,
      ratePerKg: "150.00",
      gstPct: "5.00",
      transport: "300.00", // 20 bags x ₹15
      ccDrawDate: "2026-03-15",
      amountPaid: "100000.00", // partial — ₹1L of ₹3.15L paid
    })
    .returning();
  console.log("Created Purchase P001: 20 bags @ ₹150/kg from", mill.name);

  // ── 6. Sale ──────────────────────────────────────────────
  // 10 bags x 100 kg/bag x ₹165/kg = ₹1,65,000 base + 5% GST = ₹1,73,250
  const [sale] = await db
    .insert(sales)
    .values({
      tenantId,
      displayId: "S001",
      date: "2026-03-20",
      productId: product.id,
      buyerId: buyer.id,
      viaBroker: false,
      qtyBags: 10,
      kgPerBag: 100,
      ratePerKg: "165.00",
      gstPct: "5.00",
      transport: "150.00", // 10 bags x ₹15
      amountReceived: "0.00", // nothing received yet
    })
    .returning();
  console.log("Created Sale S001: 10 bags @ ₹165/kg to", buyer.name);

  // ── 7. Payment ───────────────────────────────────────────
  // Partial payment against purchase P001
  const [payment] = await db
    .insert(payments)
    .values({
      tenantId,
      date: "2026-03-18",
      partyId: mill.id,
      direction: "Paid",
      amount: "100000.00",
      mode: "NEFT",
      againstTxnId: "P001",
      reference: "NEFT-REF-20260318",
      notes: "Partial payment against purchase P001",
    })
    .returning();
  console.log("Created Payment: ₹1,00,000 paid to", mill.name, "via NEFT");

  // ── 8. CC Entry ──────────────────────────────────────────
  // Drew ₹3,15,000 from CC for the purchase
  const [ccEntry] = await db
    .insert(ccEntries)
    .values({
      tenantId,
      date: "2026-03-15",
      event: "Draw",
      amount: "315000.00",
      runningBalance: "315000.00",
      notes: "CC draw for purchase P001 — Vardhman Polyester 30s",
    })
    .returning();
  console.log("Created CC Entry: Drew ₹3,15,000 (running balance: ₹3,15,000)");

  // ── 9. Create Siddhant's user ────────────────────────────
  const siddhantExists = await db
    .select()
    .from(users)
    .where(eq(users.email, "sid1998mundra.sm@gmail.com"))
    .then((rows) => rows[0]);

  if (!siddhantExists) {
    const siddhantHash = await bcrypt.hash("siddhant123", 10);
    const [siddhant] = await db
      .insert(users)
      .values({
        email: "sid1998mundra.sm@gmail.com",
        phone: null,
        passwordHash: siddhantHash,
        name: "Siddhant Mundra",
      })
      .returning();
    console.log("Created user 'Siddhant Mundra':", siddhant.id);

    // Create config for Siddhant too
    await db.insert(config).values({
      tenantId: siddhant.id,
      ccLimit: "5000000.00",
      ccInterestRate: "11.00",
      defaultKgPerBag: 100,
      defaultGstRate: "5.00",
      overdueDaysThreshold: 30,
    });
    console.log("Created config for Siddhant");
  } else {
    console.log("Siddhant user already exists, skipping");
  }

  // ── Done ─────────────────────────────────────────────────
  console.log("\n=== Seed complete! ===");
  console.log("Sarthak login:  sarthak2mundra@gmail.com / sarthak123");
  console.log("Siddhant login: sid1998mundra.sm@gmail.com / siddhant123");

  process.exit(0);
}

seedSarthak().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
