import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { contacts } from "../../db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";

export const contactsRouter = router({
  list: protectedProcedure
    .input(z.object({ type: z.enum(["Mill", "Buyer", "Broker"]).optional() }).optional())
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
      type: z.enum(["Mill", "Buyer", "Broker"]),
      phone: z.string().optional(),
      city: z.string().optional(),
      brokerCommissionType: z.enum(["per_bag", "percentage"]).optional(),
      brokerCommissionValue: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.insert(contacts).values({
        tenantId: ctx.tenantId,
        name: input.name,
        type: input.type,
        phone: input.phone || null,
        city: input.city || null,
        brokerCommissionType: input.type === "Broker" ? input.brokerCommissionType ?? null : null,
        brokerCommissionValue: input.type === "Broker" ? input.brokerCommissionValue ?? null : null,
        notes: input.notes || null,
      }).returning();
      return result[0];
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      type: z.enum(["Mill", "Buyer", "Broker"]),
      phone: z.string().optional(),
      city: z.string().optional(),
      brokerCommissionType: z.enum(["per_bag", "percentage"]).optional(),
      brokerCommissionValue: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.update(contacts)
        .set({
          name: input.name,
          type: input.type,
          phone: input.phone || null,
          city: input.city || null,
          brokerCommissionType: input.type === "Broker" ? input.brokerCommissionType ?? null : null,
          brokerCommissionValue: input.type === "Broker" ? input.brokerCommissionValue ?? null : null,
          notes: input.notes || null,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.id, input.id), eq(contacts.tenantId, ctx.tenantId)))
        .returning();
      return result[0];
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
