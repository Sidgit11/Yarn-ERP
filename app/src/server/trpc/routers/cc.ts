import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { ccEntries, config, ccInterestMonthly } from "../../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  computeCcInterest,
  monetaryString,
  isoDateString,
  D,
  toMoney,
} from "../../services/calculations";

export const ccRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const entries = await ctx.db
      .select()
      .from(ccEntries)
      .where(eq(ccEntries.tenantId, ctx.tenantId))
      .orderBy(asc(ccEntries.date), asc(ccEntries.createdAt));

    const cfg = await ctx.db
      .select()
      .from(config)
      .where(eq(config.tenantId, ctx.tenantId))
      .then((r: any[]) => r[0]);

    const annualRate = cfg ? parseFloat(cfg.ccInterestRate) : 11;
    const ccLimit = cfg ? parseFloat(cfg.ccLimit) : 5000000;

    // Use shared interest calculation
    const { perEntry, total: calculatedInterestTotal } = computeCcInterest(
      entries,
      annualRate
    );

    const entriesWithInterest = entries.map((entry, i) => {
      const nextDate =
        i < entries.length - 1 ? new Date(entries[i + 1].date) : new Date();
      const thisDate = new Date(entry.date);
      const days = Math.max(
        0,
        Math.floor(
          (nextDate.getTime() - thisDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      return { ...entry, days, interest: perEntry[i] };
    });

    // Actual interest from monthly entries
    const actualInterestRows = await ctx.db
      .select()
      .from(ccInterestMonthly)
      .where(eq(ccInterestMonthly.tenantId, ctx.tenantId));
    const actualInterestTotal = actualInterestRows.reduce(
      (sum: number, r: any) => sum + parseFloat(r.actualInterest),
      0
    );

    const currentBalance =
      entries.length > 0
        ? parseFloat(entries[entries.length - 1].runningBalance)
        : 0;

    return {
      entries: entriesWithInterest.reverse(),
      currentBalance,
      ccLimit,
      available: toMoney(D(ccLimit).minus(currentBalance)),
      utilizationPct: ccLimit > 0 ? toMoney(D(currentBalance).div(ccLimit).mul(100)) : 0,
      calculatedInterestTotal,
      actualInterestTotal,
      interestDifference: toMoney(D(calculatedInterestTotal).minus(actualInterestTotal)),
    };
  }),

  create: protectedProcedure
    .input(
      z.object({
        date: isoDateString,
        event: z.enum(["Draw", "Repay"]),
        amount: monetaryString,
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Transaction: read last balance + insert atomically
      return await ctx.db.transaction(async (tx: any) => {
        const lastEntry = await tx
          .select()
          .from(ccEntries)
          .where(eq(ccEntries.tenantId, ctx.tenantId))
          .orderBy(desc(ccEntries.date), desc(ccEntries.createdAt))
          .limit(1);

        const prevBalance = D(lastEntry[0]?.runningBalance ?? "0");
        const amount = D(input.amount);
        const newBalance =
          input.event === "Draw"
            ? prevBalance.plus(amount)
            : prevBalance.minus(amount);

        if (newBalance.lt(0)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Repayment exceeds current balance",
          });
        }

        const result = await tx
          .insert(ccEntries)
          .values({
            tenantId: ctx.tenantId,
            date: input.date,
            event: input.event,
            amount: input.amount,
            runningBalance: newBalance.toFixed(2),
            notes: input.notes || null,
          })
          .returning();

        return result[0];
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        date: isoDateString,
        event: z.enum(["Draw", "Repay"]),
        amount: monetaryString,
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx: any) => {
        // Verify entry exists and belongs to tenant
        const existing = await tx
          .select()
          .from(ccEntries)
          .where(
            and(
              eq(ccEntries.id, input.id),
              eq(ccEntries.tenantId, ctx.tenantId)
            )
          )
          .then((r: any[]) => r[0]);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "CC entry not found",
          });
        }

        // Update the entry itself
        await tx
          .update(ccEntries)
          .set({
            date: input.date,
            event: input.event,
            amount: input.amount,
            notes: input.notes || null,
          })
          .where(
            and(
              eq(ccEntries.id, input.id),
              eq(ccEntries.tenantId, ctx.tenantId)
            )
          );

        // Recalculate running balances for ALL entries (date/createdAt order)
        const allEntries = await tx
          .select()
          .from(ccEntries)
          .where(eq(ccEntries.tenantId, ctx.tenantId))
          .orderBy(asc(ccEntries.date), asc(ccEntries.createdAt));

        let balance = D("0");
        for (const entry of allEntries) {
          const amt = D(entry.amount);
          balance =
            entry.event === "Draw"
              ? balance.plus(amt)
              : balance.minus(amt);

          await tx
            .update(ccEntries)
            .set({ runningBalance: balance.toFixed(2) })
            .where(eq(ccEntries.id, entry.id));
        }

        // Return the updated entry
        const updated = await tx
          .select()
          .from(ccEntries)
          .where(eq(ccEntries.id, input.id))
          .then((r: any[]) => r[0]);

        return updated;
      });
    }),
});
