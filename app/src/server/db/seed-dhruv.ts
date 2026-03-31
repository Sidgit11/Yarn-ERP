import "dotenv/config";
import { db } from "./index";
import { users, config } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedDhruv() {
  console.log("=== Creating Dhruv Lath user ===\n");

  const email = "dhruvlath";
  const password = "Dhruv@123";
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .then((rows) => rows[0]);

  if (existing) {
    console.log("User already exists:", existing.id);
    process.exit(0);
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      phone: null,
      passwordHash,
      name: "Dhruv Lath",
    })
    .returning();

  console.log("Created user 'Dhruv Lath':", user.id);

  // Create default config
  await db.insert(config).values({
    tenantId: user.id,
    ccLimit: "5000000.00",
    ccInterestRate: "11.00",
    defaultKgPerBag: "100",
    defaultGstRate: "5.00",
    overdueDaysThreshold: 30,
  });
  console.log("Created default config for Dhruv");

  console.log("\n=== Done! ===");
  console.log(`Login: ${email} / ${password}`);

  process.exit(0);
}

seedDhruv().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
