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

      // Pre-build index maps for O(1) lookups instead of O(N) per contact
      const purchasesBySupplierId = new Map<string, typeof allPurchases>();
      for (const p of allPurchases) {
        const arr = purchasesBySupplierId.get(p.supplierId) ?? [];
        arr.push(p);
        purchasesBySupplierId.set(p.supplierId, arr);
      }
      const salesByBuyerId = new Map<string, typeof allSales>();
      const salesByBrokerId = new Map<string, typeof allSales>();
      for (const s of allSales) {
        const buyerArr = salesByBuyerId.get(s.buyerId) ?? [];
        buyerArr.push(s);
        salesByBuyerId.set(s.buyerId, buyerArr);
        if (s.viaBroker && s.brokerId) {
          const brokerArr = salesByBrokerId.get(s.brokerId) ?? [];
          brokerArr.push(s);
          salesByBrokerId.set(s.brokerId, brokerArr);
        }
      }
      const paymentsByPartyId = new Map<string, typeof allPayments>();
      for (const pay of allPayments) {
        const arr = paymentsByPartyId.get(pay.partyId) ?? [];
        arr.push(pay);
        paymentsByPartyId.set(pay.partyId, arr);
      }

      return filteredContacts
        .map((contact) => {
          let totalBilled = D(0);
          let totalPaidOrReceived = D(0);
          let direction = "";
          const contactPayments = paymentsByPartyId.get(contact.id) ?? [];

          if (contact.type === "Mill") {
            const contactPurchases = purchasesBySupplierId.get(contact.id) ?? [];
            for (const p of contactPurchases) {
              const t = computePurchaseTotals(p);
              totalBilled = totalBilled.plus(t.grandTotal);
              totalPaidOrReceived = totalPaidOrReceived.plus(D(p.amountPaid));
            }
            for (const pay of contactPayments) {
              if (pay.direction === "Paid") {
                totalPaidOrReceived = totalPaidOrReceived.plus(D(pay.amount));
              }
            }
            direction = "Payable";
          } else if (contact.type === "Buyer") {
            const contactSales = salesByBuyerId.get(contact.id) ?? [];
            for (const s of contactSales) {
              const t = computeSaleTotals(s);
              totalBilled = totalBilled.plus(t.totalInclGst);
              totalPaidOrReceived = totalPaidOrReceived.plus(D(s.amountReceived));
            }
            for (const pay of contactPayments) {
              if (pay.direction === "Received") {
                totalPaidOrReceived = totalPaidOrReceived.plus(D(pay.amount));
              }
            }
            direction = "Receivable";
          } else if (contact.type === "Broker") {
            const brokerSales = salesByBrokerId.get(contact.id) ?? [];
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
            for (const pay of contactPayments) {
              if (pay.direction === "Paid") {
                totalPaidOrReceived = totalPaidOrReceived.plus(D(pay.amount));
              }
            }
            direction = "Payable";
          }

          const netBalance = totalBilled.minus(totalPaidOrReceived);
          const status = netBalance.lte(0) ? "Clear" : "Pending";
          if (netBalance.lt(0)) direction = "Overpaid";

          // Days since oldest transaction for this contact (already indexed)
          let oldestUnpaidDate: Date | null = null;
          if (contact.type === "Mill" && netBalance.gt(0)) {
            const contactPurchases = purchasesBySupplierId.get(contact.id) ?? [];
            for (const p of contactPurchases) {
              const d = new Date(p.date);
              if (!oldestUnpaidDate || d < oldestUnpaidDate) oldestUnpaidDate = d;
            }
          } else if (contact.type === "Buyer" && netBalance.gt(0)) {
            const contactSales = salesByBuyerId.get(contact.id) ?? [];
            for (const s of contactSales) {
              // Use dueDate if available, otherwise fall back to sale date
              const d = s.dueDate ? new Date(s.dueDate) : new Date(s.date);
              if (!oldestUnpaidDate || d < oldestUnpaidDate) oldestUnpaidDate = d;
            }
          }

          const daysSinceOldest = oldestUnpaidDate
            ? Math.floor(
                (Date.now() - oldestUnpaidDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            : null;

          // Overdue detection for buyers with due dates
          let isOverdue = false;
          let daysOverdue: number | null = null;
          if (contact.type === "Buyer" && netBalance.gt(0)) {
            const contactSales = salesByBuyerId.get(contact.id) ?? [];
            for (const s of contactSales) {
              if (s.dueDate) {
                const due = new Date(s.dueDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                due.setHours(0, 0, 0, 0);
                const diff = Math.ceil((today.getTime() - due.getTime()) / 86400000);
                if (diff > 0 && (daysOverdue === null || diff > daysOverdue)) {
                  daysOverdue = diff;
                  isOverdue = true;
                }
              }
            }
          }

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
            isOverdue,
            daysOverdue,
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
