import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { config, ccInterestMonthly } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export const configRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const cfg = await ctx.db
      .select()
      .from(config)
      .where(eq(config.tenantId, ctx.tenantId))
      .then((r) => r[0]);

    // Get monthly interest entries
    const monthlyInterest = await ctx.db
      .select()
      .from(ccInterestMonthly)
      .where(eq(ccInterestMonthly.tenantId, ctx.tenantId))
      .orderBy(ccInterestMonthly.monthIndex);

    return { config: cfg, monthlyInterest };
  }),

  update: protectedProcedure
    .input(
      z.object({
        ccLimit: z.string(),
        ccInterestRate: z.string(),
        defaultKgPerBag: z.number().int().positive(),
        defaultGstRate: z.string(),
        overdueDaysThreshold: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(config)
        .where(eq(config.tenantId, ctx.tenantId))
        .then((r) => r[0]);

      if (existing) {
        return ctx.db
          .update(config)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(config.id, existing.id))
          .returning()
          .then((r) => r[0]);
      } else {
        return ctx.db
          .insert(config)
          .values({
            tenantId: ctx.tenantId,
            ...input,
          })
          .returning()
          .then((r) => r[0]);
      }
    }),

  updateMonthlyInterest: protectedProcedure
    .input(
      z.object({
        financialYear: z.string(),
        entries: z.array(
          z.object({
            month: z.string(),
            monthIndex: z.number(),
            actualInterest: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Transaction: upsert all 12 months atomically
      return await ctx.db.transaction(async (tx: any) => {
        for (const entry of input.entries) {
          const existing = await tx
            .select()
            .from(ccInterestMonthly)
            .where(
              and(
                eq(ccInterestMonthly.tenantId, ctx.tenantId),
                eq(ccInterestMonthly.financialYear, input.financialYear),
                eq(ccInterestMonthly.month, entry.month)
              )
            )
            .then((r: any[]) => r[0]);

          if (existing) {
            await tx
              .update(ccInterestMonthly)
              .set({
                actualInterest: entry.actualInterest,
                updatedAt: new Date(),
              })
              .where(eq(ccInterestMonthly.id, existing.id));
          } else {
            await tx.insert(ccInterestMonthly).values({
              tenantId: ctx.tenantId,
              financialYear: input.financialYear,
              month: entry.month,
              monthIndex: entry.monthIndex,
              actualInterest: entry.actualInterest,
            });
          }
        }
        return { success: true };
      });
    }),
});
