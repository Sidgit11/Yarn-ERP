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
  ccInterestMonthly,
} from "./schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

const DEMO_EMAIL = "demo@syt.app";
const DEMO_PASSWORD = "demo123";

async function seedDemo() {
  console.log("=== Seeding Demo Account ===\n");

  // ── 1. User ──────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  let tenantId: string;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .then((rows) => rows[0]);

  if (existingUser) {
    tenantId = existingUser.id;
    console.log("Demo user already exists, cleaning old data...");

    // Clean existing demo data in reverse dependency order
    await db.delete(payments).where(eq(payments.tenantId, tenantId));
    await db.delete(ccEntries).where(eq(ccEntries.tenantId, tenantId));
    await db.delete(ccInterestMonthly).where(eq(ccInterestMonthly.tenantId, tenantId));
    await db.delete(sales).where(eq(sales.tenantId, tenantId));
    await db.delete(purchases).where(eq(purchases.tenantId, tenantId));
    await db.delete(products).where(eq(products.tenantId, tenantId));
    await db.delete(contacts).where(eq(contacts.tenantId, tenantId));
    await db.delete(config).where(eq(config.tenantId, tenantId));
    console.log("Cleaned old demo data.");
  } else {
    const [user] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        phone: "9999900000",
        passwordHash,
        name: "Demo User",
      })
      .returning();
    tenantId = user.id;
    console.log("Created demo user:", tenantId);
  }

  // ── 2. Config ────────────────────────────────────────────
  await db.insert(config).values({
    tenantId,
    ccLimit: "5000000.00",
    ccInterestRate: "11.00",
    defaultKgPerBag: "100",
    defaultGstRate: "5.00",
    overdueDaysThreshold: 30,
  });
  console.log("Created config (CC limit 50L, GST 5%, interest 11%)");

  // ── 3. Contacts ──────────────────────────────────────────

  // Mills
  const [vardhman] = await db.insert(contacts).values({
    tenantId,
    name: "Vardhman Textiles",
    type: "Mill",
    phone: "9876500001",
    city: "Ludhiana",
    notes: "One of India's largest yarn manufacturers. Regular supplier.",
  }).returning();

  const [rajendra] = await db.insert(contacts).values({
    tenantId,
    name: "Rajendra Mills",
    type: "Mill",
    phone: "9876500002",
    city: "Coimbatore",
    notes: "South India mill. Good quality PC yarn.",
  }).returning();

  const [nahar] = await db.insert(contacts).values({
    tenantId,
    name: "Nahar Spinning",
    type: "Mill",
    phone: "9876500003",
    city: "Ludhiana",
    notes: "Competitive rates on polyester.",
  }).returning();

  console.log("Created 3 Mills: Vardhman, Rajendra, Nahar");

  // Buyers
  const [ramesh] = await db.insert(contacts).values({
    tenantId,
    name: "Ramesh Traders",
    type: "Buyer",
    phone: "9876600001",
    city: "Surat",
    notes: "Regular buyer. Weaving unit in Surat textile market.",
  }).returning();

  const [mahesh] = await db.insert(contacts).values({
    tenantId,
    name: "Mahesh & Co",
    type: "Buyer",
    phone: "9876600002",
    city: "Ahmedabad",
    notes: "Large buyer. Always pays on time.",
  }).returning();

  const [krishnaFab] = await db.insert(contacts).values({
    tenantId,
    name: "Krishna Fabrics",
    type: "Buyer",
    phone: "9876600003",
    city: "Panipat",
    notes: "Blanket manufacturer. Buys polyester and blended.",
  }).returning();

  console.log("Created 3 Buyers: Ramesh, Mahesh, Krishna Fabrics");

  // Brokers
  const [sharma] = await db.insert(contacts).values({
    tenantId,
    name: "Sharma Brokers",
    type: "Broker",
    phone: "9876700001",
    city: "Mumbai",
    brokerCommissionType: "per_bag",
    brokerCommissionValue: "5.00",
    notes: "Commission: Rs 5 per bag. Connects with Surat buyers.",
  }).returning();

  const [patel] = await db.insert(contacts).values({
    tenantId,
    name: "Patel Commission Agency",
    type: "Broker",
    phone: "9876700002",
    city: "Surat",
    brokerCommissionType: "percentage",
    brokerCommissionValue: "2.00",
    notes: "Commission: 2% of sale value. Good network in Gujarat.",
  }).returning();

  console.log("Created 2 Brokers: Sharma (Rs5/bag), Patel (2%)");

  // Transporter
  const [transporter] = await db.insert(contacts).values({
    tenantId,
    name: "Krishna Transport",
    type: "Transporter",
    phone: "9876800001",
    city: "Ahmedabad",
    transporterRatePerBag: "15.00",
    notes: "Rs 15 per bag. Covers Ludhiana-Surat-Ahmedabad route.",
  }).returning();

  console.log("Created 1 Transporter: Krishna Transport (Rs15/bag)");

  // ── 4. Products ──────────────────────────────────────────

  const [prodVardhmanPC] = await db.insert(products).values({
    tenantId,
    millBrand: "Vardhman",
    fibreType: "PC",
    count: "30s",
    qualityGrade: "Top",
  }).returning();

  const [prodVardhmanCotton] = await db.insert(products).values({
    tenantId,
    millBrand: "Vardhman",
    fibreType: "Cotton",
    count: "40s",
    qualityGrade: "Standard",
  }).returning();

  const [prodRajendraPC] = await db.insert(products).values({
    tenantId,
    millBrand: "Rajendra",
    fibreType: "PC",
    count: "30s",
    qualityGrade: "Top",
  }).returning();

  const [prodNaharPoly] = await db.insert(products).values({
    tenantId,
    millBrand: "Nahar",
    fibreType: "Polyester",
    count: "30s",
    qualityGrade: "Economy",
  }).returning();

  console.log("Created 4 Products: Vardhman PC 30s, Vardhman Cotton 40s, Rajendra PC 30s, Nahar Polyester 30s");

  // ── 5. Purchases ─────────────────────────────────────────
  // Total purchases: ~32.65L base

  // P001: 50 bags Vardhman PC 30s Top @ Rs200/kg from Vardhman, via Sharma broker
  const [p1] = await db.insert(purchases).values({
    tenantId,
    displayId: "P001",
    date: "2026-03-01",
    productId: prodVardhmanPC.id,
    lotNo: "VPC-2026-001",
    supplierId: vardhman.id,
    viaBroker: true,
    brokerId: sharma.id,
    qtyBags: 50,
    kgPerBag: "100",
    ratePerKg: "200.00",
    gstPct: "5.00",
    transport: "750.00",    // 50 bags x Rs15
    ccDrawDate: "2026-03-01",
    amountPaid: "0",
  }).returning();
  console.log("P001: 50 bags Vardhman PC 30s @ Rs200 = 10L base");

  // P002: 30 bags Rajendra PC 30s Top @ Rs195/kg from Rajendra Mills
  const [p2] = await db.insert(purchases).values({
    tenantId,
    displayId: "P002",
    date: "2026-03-05",
    productId: prodRajendraPC.id,
    lotNo: "RPC-2026-001",
    supplierId: rajendra.id,
    viaBroker: false,
    qtyBags: 30,
    kgPerBag: "100",
    ratePerKg: "195.00",
    gstPct: "5.00",
    transport: "450.00",
    amountPaid: "0",  // Payments recorded separately
  }).returning();
  console.log("P002: 30 bags Rajendra PC 30s @ Rs195 = 5.85L base");

  // P003: 25 bags Vardhman Cotton 40s Std @ Rs180/kg from Vardhman
  const [p3] = await db.insert(purchases).values({
    tenantId,
    displayId: "P003",
    date: "2026-03-08",
    productId: prodVardhmanCotton.id,
    lotNo: "VCT-2026-001",
    supplierId: vardhman.id,
    viaBroker: false,
    qtyBags: 25,
    kgPerBag: "100",
    ratePerKg: "180.00",
    gstPct: "5.00",
    transport: "375.00",
    amountPaid: "0",
  }).returning();
  console.log("P003: 25 bags Vardhman Cotton 40s @ Rs180 = 4.5L base");

  // P004: 40 bags Nahar Polyester 30s Eco @ Rs150/kg from Nahar
  const [p4] = await db.insert(purchases).values({
    tenantId,
    displayId: "P004",
    date: "2026-03-12",
    productId: prodNaharPoly.id,
    lotNo: "NPE-2026-001",
    supplierId: nahar.id,
    viaBroker: false,
    qtyBags: 40,
    kgPerBag: "100",
    ratePerKg: "150.00",
    gstPct: "5.00",
    transport: "600.00",
    amountPaid: "0",
  }).returning();
  console.log("P004: 40 bags Nahar Polyester 30s @ Rs150 = 6L base");

  // P005: 30 bags Vardhman PC 30s Top @ Rs205/kg (second lot, slightly higher)
  const [p5] = await db.insert(purchases).values({
    tenantId,
    displayId: "P005",
    date: "2026-03-18",
    productId: prodVardhmanPC.id,
    lotNo: "VPC-2026-002",
    supplierId: vardhman.id,
    viaBroker: true,
    brokerId: patel.id,
    qtyBags: 30,
    kgPerBag: "100",
    ratePerKg: "205.00",
    gstPct: "5.00",
    transport: "450.00",
    ccDrawDate: "2026-03-18",
    amountPaid: "0",
  }).returning();
  console.log("P005: 30 bags Vardhman PC 30s @ Rs205 = 6.15L base");

  // ── 6. Sales ─────────────────────────────────────────────

  // S001: 35 bags Vardhman PC 30s @ Rs220/kg to Ramesh, via Sharma broker
  const [s1] = await db.insert(sales).values({
    tenantId,
    displayId: "S001",
    date: "2026-03-10",
    productId: prodVardhmanPC.id,
    buyerId: ramesh.id,
    viaBroker: true,
    brokerId: sharma.id,
    qtyBags: 35,
    kgPerBag: "100",
    ratePerKg: "220.00",
    gstPct: "5.00",
    transport: "525.00",
    amountReceived: "0",  // Payments recorded separately
  }).returning();
  console.log("S001: 35 bags Vardhman PC 30s @ Rs220 = 7.7L base → Ramesh");

  // S002: 20 bags Rajendra PC 30s @ Rs215/kg to Mahesh
  const [s2] = await db.insert(sales).values({
    tenantId,
    displayId: "S002",
    date: "2026-03-14",
    productId: prodRajendraPC.id,
    buyerId: mahesh.id,
    viaBroker: false,
    qtyBags: 20,
    kgPerBag: "100",
    ratePerKg: "215.00",
    gstPct: "5.00",
    transport: "300.00",
    amountReceived: "0",
  }).returning();
  console.log("S002: 20 bags Rajendra PC 30s @ Rs215 = 4.3L base → Mahesh");

  // S003: 15 bags Vardhman Cotton 40s @ Rs200/kg to Krishna Fabrics, via Patel broker
  const [s3] = await db.insert(sales).values({
    tenantId,
    displayId: "S003",
    date: "2026-03-20",
    productId: prodVardhmanCotton.id,
    buyerId: krishnaFab.id,
    viaBroker: true,
    brokerId: patel.id,
    qtyBags: 15,
    kgPerBag: "100",
    ratePerKg: "200.00",
    gstPct: "5.00",
    transport: "225.00",
    amountReceived: "0",  // Payments recorded separately
  }).returning();
  console.log("S003: 15 bags Vardhman Cotton 40s @ Rs200 = 3L base → Krishna Fabrics");

  // S004: 25 bags Nahar Polyester 30s @ Rs170/kg to Ramesh
  const [s4] = await db.insert(sales).values({
    tenantId,
    displayId: "S004",
    date: "2026-03-22",
    productId: prodNaharPoly.id,
    buyerId: ramesh.id,
    viaBroker: false,
    qtyBags: 25,
    kgPerBag: "100",
    ratePerKg: "170.00",
    gstPct: "5.00",
    transport: "375.00",
    amountReceived: "0",
  }).returning();
  console.log("S004: 25 bags Nahar Polyester 30s @ Rs170 = 4.25L base → Ramesh");

  // ── 7. Payments ──────────────────────────────────────────

  // Pay Rs5L to Vardhman against P001
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-06",
    partyId: vardhman.id,
    direction: "Paid",
    amount: "500000.00",
    mode: "NEFT",
    againstTxnId: "P001",
    reference: "NEFT-UTR-20260306-001",
    notes: "Partial payment against P001",
  });
  console.log("Payment: Rs5L paid to Vardhman (P001) via NEFT");

  // Pay Rs3L to Rajendra against P002
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-10",
    partyId: rajendra.id,
    direction: "Paid",
    amount: "300000.00",
    mode: "NEFT",
    againstTxnId: "P002",
    reference: "NEFT-UTR-20260310-001",
    notes: "Payment against P002",
  });
  console.log("Payment: Rs3L paid to Rajendra (P002) via NEFT");

  // Receive Rs4L from Ramesh against S001
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-15",
    partyId: ramesh.id,
    direction: "Received",
    amount: "400000.00",
    mode: "UPI",
    againstTxnId: "S001",
    reference: "UPI-REF-20260315",
    notes: "Part payment from Ramesh for S001",
  });
  console.log("Payment: Rs4L received from Ramesh (S001) via UPI");

  // Receive Rs2L from Mahesh against S002
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-18",
    partyId: mahesh.id,
    direction: "Received",
    amount: "200000.00",
    mode: "NEFT",
    againstTxnId: "S002",
    reference: "NEFT-UTR-20260318-002",
    notes: "Part payment from Mahesh for S002",
  });
  console.log("Payment: Rs2L received from Mahesh (S002) via NEFT");

  // Pay Rs2L to Vardhman against P003
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-16",
    partyId: vardhman.id,
    direction: "Paid",
    amount: "200000.00",
    mode: "RTGS",
    againstTxnId: "P003",
    reference: "RTGS-REF-20260316",
    notes: "Part payment against P003",
  });
  console.log("Payment: Rs2L paid to Vardhman (P003) via RTGS");

  // Receive Rs1L from Krishna Fabrics against S003
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-24",
    partyId: krishnaFab.id,
    direction: "Received",
    amount: "100000.00",
    mode: "Cheque",
    againstTxnId: "S003",
    reference: "CHQ-4567890",
    notes: "Cheque from Krishna Fabrics for S003",
  });
  console.log("Payment: Rs1L received from Krishna Fabrics (S003) via Cheque");

  // Pay Rs5000 to Sharma broker (partial commission)
  await db.insert(payments).values({
    tenantId,
    date: "2026-03-20",
    partyId: sharma.id,
    direction: "Paid",
    amount: "5000.00",
    mode: "Cash",
    notes: "Partial broker commission payment",
  });
  console.log("Payment: Rs5K paid to Sharma broker via Cash");

  // ── 8. CC Entries ────────────────────────────────────────

  // Draw Rs10.5L for P001 (10L + 50K GST)
  await db.insert(ccEntries).values({
    tenantId,
    date: "2026-03-01",
    event: "Draw",
    amount: "1050000.00",
    runningBalance: "1050000.00",
    notes: "CC draw for P001 — Vardhman PC 30s (50 bags)",
  });
  console.log("CC Draw: Rs10.5L (balance: Rs10.5L)");

  // Draw Rs5L for P004 payments
  await db.insert(ccEntries).values({
    tenantId,
    date: "2026-03-12",
    event: "Draw",
    amount: "500000.00",
    runningBalance: "1550000.00",
    notes: "CC draw for working capital — P004 Nahar purchase",
  });
  console.log("CC Draw: Rs5L (balance: Rs15.5L)");

  // Repay Rs3L from Ramesh collection
  await db.insert(ccEntries).values({
    tenantId,
    date: "2026-03-16",
    event: "Repay",
    amount: "300000.00",
    runningBalance: "1250000.00",
    notes: "CC repayment from buyer collections",
  });
  console.log("CC Repay: Rs3L (balance: Rs12.5L)");

  // Draw Rs6.45L for P005
  await db.insert(ccEntries).values({
    tenantId,
    date: "2026-03-18",
    event: "Draw",
    amount: "645000.00",
    runningBalance: "1895000.00",
    notes: "CC draw for P005 — Vardhman PC 30s (30 bags)",
  });
  console.log("CC Draw: Rs6.45L (balance: Rs18.95L)");

  // Repay Rs2L
  await db.insert(ccEntries).values({
    tenantId,
    date: "2026-03-25",
    event: "Repay",
    amount: "200000.00",
    runningBalance: "1695000.00",
    notes: "CC repayment from Mahesh collection",
  });
  console.log("CC Repay: Rs2L (balance: Rs16.95L)");

  // ── 9. Monthly CC Interest ───────────────────────────────

  await db.insert(ccInterestMonthly).values([
    { tenantId, financialYear: "2025-26", month: "Apr", monthIndex: 1, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "May", monthIndex: 2, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Jun", monthIndex: 3, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Jul", monthIndex: 4, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Aug", monthIndex: 5, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Sep", monthIndex: 6, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Oct", monthIndex: 7, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Nov", monthIndex: 8, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Dec", monthIndex: 9, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Jan", monthIndex: 10, actualInterest: "0.00" },
    { tenantId, financialYear: "2025-26", month: "Feb", monthIndex: 11, actualInterest: "4200.00" },
    { tenantId, financialYear: "2025-26", month: "Mar", monthIndex: 12, actualInterest: "5800.00" },
  ]);
  console.log("Created monthly CC interest (Feb: Rs4200, Mar: Rs5800)");

  // ── Done ─────────────────────────────────────────────────
  console.log("\n=== Demo Seed Complete! ===");
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("\nData summary:");
  console.log("  Contacts: 3 mills, 3 buyers, 2 brokers, 1 transporter");
  console.log("  Products: 4 yarn types");
  console.log("  Purchases: 5 (P001-P005) totalling ~32.5L");
  console.log("  Sales: 4 (S001-S004) totalling ~19.25L");
  console.log("  Payments: 7 (mix of paid/received)");
  console.log("  CC Entries: 5 (3 draws, 2 repays, balance Rs16.95L)");

  process.exit(0);
}

seedDemo().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
