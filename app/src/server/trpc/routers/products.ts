import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { products } from "../../db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";

export const productsRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.select().from(products)
        .where(and(
          eq(products.tenantId, ctx.tenantId),
          isNull(products.deletedAt),
        ))
        .orderBy(asc(products.millBrand));
      return rows.map((row) => ({
        ...row,
        fullName: `${row.millBrand} ${row.fibreType} ${row.count} ${row.qualityGrade}${row.colorShade ? ` ${row.colorShade}` : ""}`,
      }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.select().from(products).where(
        and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId))
      );
      if (!result[0]) return null;
      const row = result[0];
      return {
        ...row,
        fullName: `${row.millBrand} ${row.fibreType} ${row.count} ${row.qualityGrade}${row.colorShade ? ` ${row.colorShade}` : ""}`,
      };
    }),

  create: protectedProcedure
    .input(z.object({
      millBrand: z.string().min(1),
      fibreType: z.enum(["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"]),
      count: z.string().min(1),
      qualityGrade: z.enum(["Top", "Standard", "Economy"]),
      hsnCode: z.string().optional(),
      colorShade: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.insert(products).values({
        tenantId: ctx.tenantId,
        millBrand: input.millBrand,
        fibreType: input.fibreType,
        count: input.count,
        qualityGrade: input.qualityGrade,
        hsnCode: input.hsnCode || null,
        colorShade: input.colorShade || null,
      }).returning();
      return result[0];
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      millBrand: z.string().min(1),
      fibreType: z.enum(["PC", "Cotton", "Polyester", "Viscose", "Nylon", "Acrylic", "Blended"]),
      count: z.string().min(1),
      qualityGrade: z.enum(["Top", "Standard", "Economy"]),
      hsnCode: z.string().optional(),
      colorShade: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.update(products)
        .set({
          millBrand: input.millBrand,
          fibreType: input.fibreType,
          count: input.count,
          qualityGrade: input.qualityGrade,
          hsnCode: input.hsnCode || null,
          colorShade: input.colorShade || null,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId)))
        .returning();
      return result[0];
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(products).where(
        and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId))
      );
      if (!existing[0]) throw new Error("Product not found");
      const result = await ctx.db.update(products)
        .set({
          active: !existing[0].active,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId)))
        .returning();
      return result[0];
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(products)
        .set({ deletedAt: new Date() })
        .where(and(eq(products.id, input.id), eq(products.tenantId, ctx.tenantId)));
      return { success: true };
    }),
});
