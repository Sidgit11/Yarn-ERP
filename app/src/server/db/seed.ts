import { db } from "./index";
import { users, config, contacts, products } from "./schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // Create default user
  const passwordHash = await bcrypt.hash("password123", 10);
  const existingUsers = await db.select().from(users);

  let tenantId: string;

  if (existingUsers.length > 0) {
    tenantId = existingUsers[0].id;
    console.log("User already exists, using existing user:", tenantId);
  } else {
    const [user] = await db
      .insert(users)
      .values({
        phone: "9876543210",
        passwordHash,
        name: "Sarthak",
      })
      .returning();
    tenantId = user.id;
    console.log("Created user:", tenantId);
  }

  // Create config (skip if exists)
  const existingConfig = await db.select().from(config);
  if (existingConfig.length === 0) {
    await db.insert(config).values({
      tenantId,
    });
    console.log("Created default config");
  } else {
    console.log("Config already exists, skipping");
  }

  // Create contacts
  const contactsData = [
    { tenantId, name: "Rajendra Mills", type: "Mill" as const },
    { tenantId, name: "Vardhman Textiles", type: "Mill" as const },
    { tenantId, name: "Ramesh Traders", type: "Buyer" as const },
    { tenantId, name: "Mahesh & Co", type: "Buyer" as const },
    {
      tenantId,
      name: "Suresh Broker",
      type: "Broker" as const,
      brokerCommissionType: "per_bag" as const,
      brokerCommissionValue: "5",
    },
  ];

  for (const c of contactsData) {
    const existing = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.name, c.name), eq(contacts.tenantId, tenantId)))
      .then((rows) => rows[0]);

    if (!existing) {
      await db.insert(contacts).values(c);
      console.log("Created contact:", c.name);
    } else {
      console.log("Contact already exists:", c.name);
    }
  }

  // Create products
  const productsData = [
    {
      tenantId,
      millBrand: "Rajendra Mills",
      fibreType: "PC" as const,
      count: "30s",
      qualityGrade: "Top" as const,
    },
    {
      tenantId,
      millBrand: "Rajendra Mills",
      fibreType: "PC" as const,
      count: "40s",
      qualityGrade: "Standard" as const,
    },
    {
      tenantId,
      millBrand: "Vardhman Textiles",
      fibreType: "Cotton" as const,
      count: "30s",
      qualityGrade: "Top" as const,
    },
  ];

  for (const p of productsData) {
    const existing = await db
      .select()
      .from(products)
      .then((rows) =>
        rows.find(
          (r) =>
            r.millBrand === p.millBrand &&
            r.fibreType === p.fibreType &&
            r.count === p.count &&
            r.qualityGrade === p.qualityGrade &&
            r.tenantId === tenantId
        )
      );

    if (!existing) {
      await db.insert(products).values(p);
      console.log(
        "Created product:",
        `${p.millBrand} ${p.fibreType} ${p.count} ${p.qualityGrade}`
      );
    } else {
      console.log(
        "Product already exists:",
        `${p.millBrand} ${p.fibreType} ${p.count} ${p.qualityGrade}`
      );
    }
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
