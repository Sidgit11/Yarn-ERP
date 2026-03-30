import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { contacts, products, purchases, sales } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { monetaryString, isoDateString, percentageString } from "../../services/calculations";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Coerce value to string (Excel sends numbers for numeric fields). */
const coerceString = z.union([z.string(), z.number()]).transform((v) => String(v));

/** Optional string that treats empty string as undefined. */
const optString = z.union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? undefined : String(v)))
  .pipe(z.string().optional());

/** Parse Zod v4 error into human-readable messages. */
function formatZodErrors(error: z.ZodError): string[] {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed)) {
      return parsed.map((e: any) => {
        const path = e.path?.length ? e.path.join(".") + ": " : "";
        return `${path}${e.message}`;
      });
    }
  } catch {
    // Not JSON, use as-is
  }
  return [error.message];
}

// ── Zod schemas for bulk import ─────────────────────────────────────────────

const contactImportSchema = z.object({
  name: coerceString.pipe(z.string().min(1, "Name is required")),
  type: z.enum(["Mill", "Buyer", "Broker", "Transporter"]),
  phone: optString,
  city: optString,
  brokerCommissionType: z.union([
    z.enum(["per_bag", "percentage"]),
    z.literal(""),
    z.null(),
    z.undefined(),
  ]).transform((v) => (v === "" || v === null || v === undefined ? undefined : v)).pipe(z.enum(["per_bag", "percentage"]).optional()),
  brokerCommissionValue: optString,
  transporterRatePerBag: optString,
  notes: optString,
});

const productImportSchema = z.object({
  millBrand: coerceString.pipe(z.string().min(1, "Mill/Brand is required")),
  fibreType: z.enum(["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"]),
  count: coerceString.pipe(z.string().min(1, "Count is required")),
  qualityGrade: z.enum(["Top", "Standard", "Economy"]),
});

const coerceInt = z.union([z.number(), z.string()]).transform((v) => typeof v === "string" ? parseInt(v, 10) : v).pipe(z.number().int().positive());
const coerceMoney = z.union([z.number(), z.string()]).transform((v) => String(v)).pipe(monetaryString);
const coercePct = z.union([z.number(), z.string()]).transform((v) => String(v)).pipe(percentageString);
const coerceMoneyDefault0 = z.union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? "0" : String(v)))
  .pipe(monetaryString);

const purchaseImportSchema = z.object({
  date: coerceString.pipe(isoDateString),
  supplierName: coerceString.pipe(z.string().min(1, "Supplier name required")),
  productName: coerceString.pipe(z.string().min(1, "Product name required")),
  qtyBags: coerceInt,
  kgPerBag: coerceInt,
  ratePerKg: coerceMoney,
  gstPct: coercePct,
  transport: coerceMoneyDefault0,
  amountPaid: coerceMoneyDefault0,
});

const saleImportSchema = z.object({
  date: coerceString.pipe(isoDateString),
  buyerName: coerceString.pipe(z.string().min(1, "Buyer name required")),
  productName: coerceString.pipe(z.string().min(1, "Product name required")),
  qtyBags: coerceInt,
  kgPerBag: coerceInt,
  ratePerKg: coerceMoney,
  gstPct: coercePct,
  transport: coerceMoneyDefault0,
  amountReceived: coerceMoneyDefault0,
});

// ── Router ──────────────────────────────────────────────────────────────────

export const importRouter = router({
  // Validate parsed data before import
  validateContacts: protectedProcedure
    .input(z.object({ rows: z.array(z.record(z.string(), z.any())) }))
    .mutation(({ input }) => {
      return input.rows.map((row, i) => {
        const result = contactImportSchema.safeParse(row);
        return {
          rowIndex: i,
          data: row,
          valid: result.success,
          errors: result.success ? [] : formatZodErrors(result.error),
        };
      });
    }),

  validateProducts: protectedProcedure
    .input(z.object({ rows: z.array(z.record(z.string(), z.any())) }))
    .mutation(({ input }) => {
      return input.rows.map((row, i) => {
        const result = productImportSchema.safeParse(row);
        return {
          rowIndex: i,
          data: row,
          valid: result.success,
          errors: result.success ? [] : formatZodErrors(result.error),
        };
      });
    }),

  validatePurchases: protectedProcedure
    .input(z.object({ rows: z.array(z.record(z.string(), z.any())) }))
    .mutation(({ input }) => {
      return input.rows.map((row, i) => {
        const result = purchaseImportSchema.safeParse(row);
        return {
          rowIndex: i,
          data: row,
          valid: result.success,
          errors: result.success ? [] : formatZodErrors(result.error),
        };
      });
    }),

  validateSales: protectedProcedure
    .input(z.object({ rows: z.array(z.record(z.string(), z.any())) }))
    .mutation(({ input }) => {
      return input.rows.map((row, i) => {
        const result = saleImportSchema.safeParse(row);
        return {
          rowIndex: i,
          data: row,
          valid: result.success,
          errors: result.success ? [] : formatZodErrors(result.error),
        };
      });
    }),

  // Bulk import contacts
  importContacts: protectedProcedure
    .input(z.object({ rows: z.array(contactImportSchema) }))
    .mutation(async ({ ctx, input }) => {
      const results = await ctx.db.transaction(async (tx: any) => {
        const imported = [];
        for (const row of input.rows) {
          const [result] = await tx
            .insert(contacts)
            .values({
              tenantId: ctx.tenantId,
              name: row.name,
              type: row.type,
              phone: row.phone || null,
              city: row.city || null,
              brokerCommissionType: row.type === "Broker" ? row.brokerCommissionType ?? null : null,
              brokerCommissionValue: row.type === "Broker" ? row.brokerCommissionValue ?? null : null,
              transporterRatePerBag: row.type === "Transporter" ? row.transporterRatePerBag ?? null : null,
              notes: row.notes || null,
            })
            .returning();
          imported.push(result);
        }
        return imported;
      });
      return { count: results.length };
    }),

  // Bulk import products
  importProducts: protectedProcedure
    .input(z.object({ rows: z.array(productImportSchema) }))
    .mutation(async ({ ctx, input }) => {
      const results = await ctx.db.transaction(async (tx: any) => {
        const imported = [];
        for (const row of input.rows) {
          const [result] = await tx
            .insert(products)
            .values({
              tenantId: ctx.tenantId,
              millBrand: row.millBrand,
              fibreType: row.fibreType,
              count: row.count,
              qualityGrade: row.qualityGrade,
            })
            .returning();
          imported.push(result);
        }
        return imported;
      });
      return { count: results.length };
    }),

  // Bulk import purchases (matches supplier/product by name)
  importPurchases: protectedProcedure
    .input(z.object({ rows: z.array(purchaseImportSchema) }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        // Load contacts and products for name matching
        const allContacts = await tx.select().from(contacts)
          .where(eq(contacts.tenantId, ctx.tenantId));
        const allProducts = await tx.select().from(products)
          .where(eq(products.tenantId, ctx.tenantId));

        const contactByName = new Map<string, any>(allContacts.map((c: any) => [c.name.toLowerCase(), c]));
        const productByName = new Map<string, any>(allProducts.map((p: any) => [
          `${p.millBrand} ${p.fibreType} ${p.count} ${p.qualityGrade}`.toLowerCase(),
          p,
        ]));

        // Get last display ID
        const lastPurchase = await tx
          .select({ displayId: purchases.displayId })
          .from(purchases)
          .where(eq(purchases.tenantId, ctx.tenantId))
          .orderBy(desc(purchases.displayId))
          .limit(1);
        let nextNum = lastPurchase[0]?.displayId
          ? parseInt(lastPurchase[0].displayId.replace("P", ""), 10) + 1
          : 1;

        let count = 0;
        const errors: string[] = [];

        for (let i = 0; i < input.rows.length; i++) {
          const row = input.rows[i];
          const supplier = contactByName.get(row.supplierName.toLowerCase());
          const product = productByName.get(row.productName.toLowerCase());

          if (!supplier) {
            errors.push(`Row ${i + 1}: Supplier "${row.supplierName}" not found`);
            continue;
          }
          if (!product) {
            errors.push(`Row ${i + 1}: Product "${row.productName}" not found`);
            continue;
          }

          const displayId = `P${String(nextNum).padStart(3, "0")}`;
          nextNum++;

          await tx.insert(purchases).values({
            tenantId: ctx.tenantId,
            displayId,
            date: row.date,
            productId: product.id,
            supplierId: supplier.id,
            viaBroker: false,
            qtyBags: row.qtyBags,
            kgPerBag: row.kgPerBag,
            ratePerKg: row.ratePerKg,
            gstPct: row.gstPct,
            transport: row.transport,
            amountPaid: row.amountPaid,
          });
          count++;
        }

        return { count, errors };
      });
    }),

  // Bulk import sales
  importSales: protectedProcedure
    .input(z.object({ rows: z.array(saleImportSchema) }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        const allContacts = await tx.select().from(contacts)
          .where(eq(contacts.tenantId, ctx.tenantId));
        const allProducts = await tx.select().from(products)
          .where(eq(products.tenantId, ctx.tenantId));

        const contactByName = new Map<string, any>(allContacts.map((c: any) => [c.name.toLowerCase(), c]));
        const productByName = new Map<string, any>(allProducts.map((p: any) => [
          `${p.millBrand} ${p.fibreType} ${p.count} ${p.qualityGrade}`.toLowerCase(),
          p,
        ]));

        const lastSale = await tx
          .select({ displayId: sales.displayId })
          .from(sales)
          .where(eq(sales.tenantId, ctx.tenantId))
          .orderBy(desc(sales.displayId))
          .limit(1);
        let nextNum = lastSale[0]?.displayId
          ? parseInt(lastSale[0].displayId.replace("S", ""), 10) + 1
          : 1;

        let count = 0;
        const errors: string[] = [];

        for (let i = 0; i < input.rows.length; i++) {
          const row = input.rows[i];
          const buyer = contactByName.get(row.buyerName.toLowerCase());
          const product = productByName.get(row.productName.toLowerCase());

          if (!buyer) {
            errors.push(`Row ${i + 1}: Buyer "${row.buyerName}" not found`);
            continue;
          }
          if (!product) {
            errors.push(`Row ${i + 1}: Product "${row.productName}" not found`);
            continue;
          }

          const displayId = `S${String(nextNum).padStart(3, "0")}`;
          nextNum++;

          await tx.insert(sales).values({
            tenantId: ctx.tenantId,
            displayId,
            date: row.date,
            productId: product.id,
            buyerId: buyer.id,
            viaBroker: false,
            qtyBags: row.qtyBags,
            kgPerBag: row.kgPerBag,
            ratePerKg: row.ratePerKg,
            gstPct: row.gstPct,
            transport: row.transport,
            amountReceived: row.amountReceived,
          });
          count++;
        }

        return { count, errors };
      });
    }),
});
