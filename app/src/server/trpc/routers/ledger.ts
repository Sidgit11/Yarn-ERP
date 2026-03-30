import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { contacts, purchases, sales, payments } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  computePurchaseTotals,
  computeSaleTotals,
  computeBrokerCommission,
  D,
  toMoney,
} from "../../services/calculations";

export const ledgerRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({ type: z.enum(["Mill", "Buyer", "Broker"]).optional() })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Load all data in 4 parallel queries
      const [allContacts, allPurchases, allSales, allPayments] = await Promise.all([
        ctx.db.select().from(contacts)
          .where(and(eq(contacts.tenantId, ctx.tenantId), isNull(contacts.deletedAt))),
        ctx.db.select().from(purchases)
          .where(and(eq(purchases.tenantId, ctx.tenantId), isNull(purchases.deletedAt))),
        ctx.db.select().from(sales)
          .where(and(eq(sales.tenantId, ctx.tenantId), isNull(sales.deletedAt))),
        ctx.db.select().from(payments)
          .where(and(eq(payments.tenantId, ctx.tenantId), isNull(payments.deletedAt))),
      ]);

      const filteredContacts = input?.type
        ? allContacts.filter((c) => c.type === input.type)
        : allContacts;

      return filteredContacts
        .map((contact) => {
          let totalBilled = D(0);
          let totalPaidOrReceived = D(0);
          let direction = "";

          if (contact.type === "Mill") {
            const contactPurchases = allPurchases.filter(
              (p) => p.supplierId === contact.id
            );
            for (const p of contactPurchases) {
              const t = computePurchaseTotals(p);
              totalBilled = totalBilled.plus(t.grandTotal);
              totalPaidOrReceived = totalPaidOrReceived.plus(D(p.amountPaid));
            }
            const paidPayments = allPayments.filter(
              (pay) => pay.partyId === contact.id && pay.direction === "Paid"
            );
            for (const pay of paidPayments) {
              totalPaidOrReceived = totalPaidOrReceived.plus(D(pay.amount));
            }
            direction = "Payable";
          } else if (contact.type === "Buyer") {
            const contactSales = allSales.filter(
              (s) => s.buyerId === contact.id
            );
            for (const s of contactSales) {
              const t = computeSaleTotals(s);
              totalBilled = totalBilled.plus(t.totalInclGst);
              totalPaidOrReceived = totalPaidOrReceived.plus(D(s.amountReceived));
            }
            const receivedPayments = allPayments.filter(
              (pay) => pay.partyId === contact.id && pay.direction === "Received"
            );
            for (const pay of receivedPayments) {
              totalPaidOrReceived = totalPaidOrReceived.plus(D(pay.amount));
            }
            direction = "Receivable";
          } else if (contact.type === "Broker") {
            const brokerSales = allSales.filter(
              (s) => s.viaBroker && s.brokerId === contact.id
            );
            for (const s of brokerSales) {
              const t = computeSaleTotals(s);
              totalBilled = totalBilled.plus(
                computeBrokerCommission(
                  contact.brokerCommissionType,
                  contact.brokerCommissionValue,
                  s.qtyBags,
                  t.baseAmount
                )
              );
            }
            const paidPayments = allPayments.filter(
              (pay) => pay.partyId === contact.id && pay.direction === "Paid"
            );
            for (const pay of paidPayments) {
              totalPaidOrReceived = totalPaidOrReceived.plus(D(pay.amount));
            }
            direction = "Payable";
          }

          const netBalance = totalBilled.minus(totalPaidOrReceived);
          const status = netBalance.lte(0) ? "Clear" : "Pending";
          if (netBalance.lt(0)) direction = "Overpaid";

          // Days since oldest unpaid transaction
          let oldestUnpaidDate: Date | null = null;
          if (contact.type === "Mill" && netBalance.gt(0)) {
            const unpaid = allPurchases
              .filter((p) => p.supplierId === contact.id)
              .sort(
                (a, b) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime()
              );
            if (unpaid.length > 0) oldestUnpaidDate = new Date(unpaid[0].date);
          } else if (contact.type === "Buyer" && netBalance.gt(0)) {
            const unpaid = allSales
              .filter((s) => s.buyerId === contact.id)
              .sort(
                (a, b) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime()
              );
            if (unpaid.length > 0) oldestUnpaidDate = new Date(unpaid[0].date);
          }

          const daysSinceOldest = oldestUnpaidDate
            ? Math.floor(
                (Date.now() - oldestUnpaidDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            : null;

          return {
            id: contact.id,
            name: contact.name,
            type: contact.type,
            totalBilled: toMoney(totalBilled),
            totalPaidOrReceived: toMoney(totalPaidOrReceived),
            netBalance: toMoney(netBalance),
            direction,
            status,
            daysSinceOldest,
          };
        })
        .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
    }),

  partyDetail: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.id, input.contactId),
            eq(contacts.tenantId, ctx.tenantId)
          )
        )
        .then((r: any[]) => r[0]);
      if (!contact) return null;

      let transactions: Array<{
        type: string;
        displayId: string;
        date: string;
        amount: number;
        description: string;
      }> = [];

      if (contact.type === "Mill") {
        const rows = await ctx.db
          .select()
          .from(purchases)
          .where(
            and(
              eq(purchases.supplierId, input.contactId),
              eq(purchases.tenantId, ctx.tenantId),
              isNull(purchases.deletedAt)
            )
          );
        transactions = rows.map((p: any) => {
          const t = computePurchaseTotals(p);
          return {
            type: "Purchase",
            displayId: p.displayId,
            date: p.date,
            amount: t.grandTotal,
            description: `${p.qtyBags} bags @ Rs.${parseFloat(p.ratePerKg).toFixed(2)}/kg`,
          };
        });
      } else if (contact.type === "Buyer") {
        const rows = await ctx.db
          .select()
          .from(sales)
          .where(
            and(
              eq(sales.buyerId, input.contactId),
              eq(sales.tenantId, ctx.tenantId),
              isNull(sales.deletedAt)
            )
          );
        transactions = rows.map((s: any) => {
          const t = computeSaleTotals(s);
          return {
            type: "Sale",
            displayId: s.displayId,
            date: s.date,
            amount: t.totalInclGst,
            description: `${s.qtyBags} bags @ Rs.${parseFloat(s.ratePerKg).toFixed(2)}/kg`,
          };
        });
      } else if (contact.type === "Broker") {
        const rows = await ctx.db
          .select()
          .from(sales)
          .where(
            and(
              eq(sales.brokerId, input.contactId),
              eq(sales.tenantId, ctx.tenantId),
              isNull(sales.deletedAt)
            )
          );
        transactions = rows
          .filter((s: any) => s.viaBroker)
          .map((s: any) => {
            const t = computeSaleTotals(s);
            const commission = computeBrokerCommission(
              contact.brokerCommissionType,
              contact.brokerCommissionValue,
              s.qtyBags,
              t.baseAmount
            );
            return {
              type: "Commission",
              displayId: s.displayId,
              date: s.date,
              amount: commission,
              description: `Commission on ${s.qtyBags} bags (${s.displayId})`,
            };
          });
      }

      const partyPayments = await ctx.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.partyId, input.contactId),
            eq(payments.tenantId, ctx.tenantId),
            isNull(payments.deletedAt)
          )
        );

      const paymentsList = partyPayments.map((p: any) => ({
        type: "Payment",
        displayId: p.againstTxnId ?? "General",
        date: p.date,
        amount: parseFloat(p.amount),
        description: `${p.direction} via ${p.mode}${p.reference ? ` (${p.reference})` : ""}`,
      }));

      const allEntries = [...transactions, ...paymentsList].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      return {
        contact,
        entries: allEntries,
      };
    }),
});
