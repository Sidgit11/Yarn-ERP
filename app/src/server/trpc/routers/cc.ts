import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { ccEntries, config, ccInterestMonthly } from "../../db/schema";
import { eq, desc, asc } from "drizzle-orm";

export const ccRouter = router({
  // Get all CC entries with running balance and per-entry interest
  list: protectedProcedure.query(async ({ ctx }) => {
    const entries = await ctx.db
      .select()
      .from(ccEntries)
      .where(eq(ccEntries.tenantId, ctx.tenantId))
      .orderBy(asc(ccEntries.date), asc(ccEntries.createdAt));

    // Get config for interest rate
    const cfg = await ctx.db
      .select()
      .from(config)
      .where(eq(config.tenantId, ctx.tenantId))
      .then((r) => r[0]);
    const annualRate = cfg ? parseFloat(cfg.ccInterestRate) : 11;

    // Calculate interest for each entry period
    const now = new Date();
    const entriesWithInterest = entries.map((entry, i) => {
      const nextDate =
        i < entries.length - 1 ? new Date(entries[i + 1].date) : now;
      const thisDate = new Date(entry.date);
      const days = Math.max(
        0,
        Math.floor(
          (nextDate.getTime() - thisDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      const balance = parseFloat(entry.runningBalance);
      const interest = (balance * days * annualRate) / 365 / 100;
      return {
        ...entry,
        days,
        interest: Math.round(interest * 100) / 100, // round to 2 decimal
      };
    });

    const calculatedInterestTotal = entriesWithInterest.reduce(
      (sum, e) => sum + e.interest,
      0
    );

    // Get actual interest total from cc_interest_monthly
    const actualInterestRows = await ctx.db
      .select()
      .from(ccInterestMonthly)
      .where(eq(ccInterestMonthly.tenantId, ctx.tenantId));
    const actualInterestTotal = actualInterestRows.reduce(
      (sum, r) => sum + parseFloat(r.actualInterest),
      0
    );

    // Current balance = last entry's running balance, or 0
    const currentBalance =
      entries.length > 0
        ? parseFloat(entries[entries.length - 1].runningBalance)
        : 0;
    const ccLimit = cfg ? parseFloat(cfg.ccLimit) : 5000000;

    return {
      entries: entriesWithInterest.reverse(), // show newest first for display
      currentBalance,
      ccLimit,
      available: ccLimit - currentBalance,
      utilizationPct: ccLimit > 0 ? (currentBalance / ccLimit) * 100 : 0,
      calculatedInterestTotal:
        Math.round(calculatedInterestTotal * 100) / 100,
      actualInterestTotal,
      interestDifference:
        Math.round((calculatedInterestTotal - actualInterestTotal) * 100) /
        100,
    };
  }),

  // Add a CC draw or repayment
  create: protectedProcedure
    .input(
      z.object({
        date: z.string(),
        event: z.enum(["Draw", "Repay"]),
        amount: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get current running balance (from latest entry)
      const lastEntry = await ctx.db
        .select()
        .from(ccEntries)
        .where(eq(ccEntries.tenantId, ctx.tenantId))
        .orderBy(desc(ccEntries.date), desc(ccEntries.createdAt))
        .limit(1);

      const prevBalance =
        lastEntry.length > 0 ? parseFloat(lastEntry[0].runningBalance) : 0;
      const amount = parseFloat(input.amount);
      const newBalance =
        input.event === "Draw" ? prevBalance + amount : prevBalance - amount;

      const result = await ctx.db
        .insert(ccEntries)
        .values({
          tenantId: ctx.tenantId,
          date: input.date,
          event: input.event,
          amount: input.amount,
          runningBalance: String(newBalance),
          notes: input.notes || null,
        })
        .returning();

      return result[0];
    }),
});
