import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { contacts, rateChangeLog } from "../../db/schema";
import { eq, and, isNull, asc, desc } from "drizzle-orm";

export const contactsRouter = router({
  list: protectedProcedure
    .input(z.object({ type: z.enum(["Mill", "Buyer", "Broker", "Transporter"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(contacts.tenantId, ctx.tenantId),
        isNull(contacts.deletedAt),
      ];
      if (input?.type) {
        conditions.push(eq(contacts.type, input.type));
      }
      return ctx.db.select().from(contacts).where(and(...conditions)).orderBy(asc(contacts.name));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.select().from(contacts).where(
        and(eq(contacts.id, input.id), eq(contacts.tenantId, ctx.tenantId))
      );
      return result[0] ?? null;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(["Mill", "Buyer", "Broker", "Transporter"]),
      phone: z.string().optional(),
      city: z.string().optional(),
      gstin: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      creditTermDays: z.number().int().positive().optional(),
      bankAccountNo: z.string().optional(),
      bankIfsc: z.string().optional(),
      bankName: z.string().optional(),
      brokerCommissionType: z.enum(["per_bag", "percentage"]).optional(),
      brokerCommissionValue: z.string().optional(),
      transporterRatePerBag: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.insert(contacts).values({
        tenantId: ctx.tenantId,
        name: input.name,
        type: input.type,
        phone: input.phone || null,
        city: input.city || null,
        gstin: input.gstin || null,
        email: input.email || null,
        creditTermDays: input.creditTermDays ?? null,
        bankAccountNo: input.bankAccountNo || null,
        bankIfsc: input.bankIfsc || null,
        bankName: input.bankName || null,
        brokerCommissionType: input.type === "Broker" ? input.brokerCommissionType ?? null : null,
        brokerCommissionValue: input.type === "Broker" ? input.brokerCommissionValue ?? null : null,
        transporterRatePerBag: input.type === "Transporter" ? input.transporterRatePerBag ?? null : null,
        notes: input.notes || null,
      }).returning();
      return result[0];
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      type: z.enum(["Mill", "Buyer", "Broker", "Transporter"]),
      phone: z.string().optional(),
      city: z.string().optional(),
      gstin: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      creditTermDays: z.number().int().positive().optional().nullable(),
      bankAccountNo: z.string().optional(),
      bankIfsc: z.string().optional(),
      bankName: z.string().optional(),
      brokerCommissionType: z.enum(["per_bag", "percentage"]).optional(),
      brokerCommissionValue: z.string().optional(),
      transporterRatePerBag: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch existing contact to compare rates for change log
      const existing = await ctx.db.select().from(contacts).where(
        and(eq(contacts.id, input.id), eq(contacts.tenantId, ctx.tenantId))
      ).then(rows => rows[0]);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }

      // Log rate changes for broker/transporter
      const changeLogs: { fieldChanged: string; oldValue: string | null; newValue: string | null }[] = [];

      if (input.type === "Broker") {
        const newCommType = input.brokerCommissionType ?? null;
        const newCommVal = input.brokerCommissionValue ?? null;
        if (existing.brokerCommissionType !== newCommType) {
          changeLogs.push({ fieldChanged: "brokerCommissionType", oldValue: existing.brokerCommissionType, newValue: newCommType });
        }
        if (existing.brokerCommissionValue !== newCommVal) {
          changeLogs.push({ fieldChanged: "brokerCommissionValue", oldValue: existing.brokerCommissionValue, newValue: newCommVal });
        }
      }
      if (input.type === "Transporter") {
        const newRate = input.transporterRatePerBag ?? null;
        if (existing.transporterRatePerBag !== newRate) {
          changeLogs.push({ fieldChanged: "transporterRatePerBag", oldValue: existing.transporterRatePerBag, newValue: newRate });
        }
      }

      // Transaction: log changes + update atomically
      return await ctx.db.transaction(async (tx: any) => {
        if (changeLogs.length > 0) {
          await tx.insert(rateChangeLog).values(
            changeLogs.map(cl => ({
              tenantId: ctx.tenantId,
              contactId: input.id,
              ...cl,
            }))
          );
        }

        const result = await tx.update(contacts)
          .set({
            name: input.name,
            type: input.type,
            phone: input.phone || null,
            city: input.city || null,
            gstin: input.gstin || null,
            email: input.email || null,
            creditTermDays: input.creditTermDays ?? null,
            bankAccountNo: input.bankAccountNo || null,
            bankIfsc: input.bankIfsc || null,
            bankName: input.bankName || null,
            brokerCommissionType: input.type === "Broker" ? input.brokerCommissionType ?? null : null,
            brokerCommissionValue: input.type === "Broker" ? input.brokerCommissionValue ?? null : null,
            transporterRatePerBag: input.type === "Transporter" ? input.transporterRatePerBag ?? null : null,
            notes: input.notes || null,
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.id, input.id), eq(contacts.tenantId, ctx.tenantId)))
          .returning();
        return result[0];
      });
    }),

  rateChangeHistory: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(rateChangeLog)
        .where(and(
          eq(rateChangeLog.contactId, input.contactId),
          eq(rateChangeLog.tenantId, ctx.tenantId),
        ))
        .orderBy(desc(rateChangeLog.changedAt));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(contacts)
        .set({ deletedAt: new Date() })
        .where(and(eq(contacts.id, input.id), eq(contacts.tenantId, ctx.tenantId)));
      return { success: true };
    }),
});
