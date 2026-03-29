import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { contacts, purchases, sales, payments } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const ledgerRouter = router({
  // Get aggregated ledger for all parties
  list: protectedProcedure
    .input(z.object({ type: z.enum(["Mill", "Buyer", "Broker"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const allContacts = await ctx.db.select().from(contacts)
        .where(and(eq(contacts.tenantId, ctx.tenantId), isNull(contacts.deletedAt)));

      const filteredContacts = input?.type
        ? allContacts.filter(c => c.type === input.type)
        : allContacts;

      const allPurchases = await ctx.db.select().from(purchases)
        .where(and(eq(purchases.tenantId, ctx.tenantId), isNull(purchases.deletedAt)));
      const allSales = await ctx.db.select().from(sales)
        .where(and(eq(sales.tenantId, ctx.tenantId), isNull(sales.deletedAt)));
      const allPayments = await ctx.db.select().from(payments)
        .where(and(eq(payments.tenantId, ctx.tenantId), isNull(payments.deletedAt)));

      return filteredContacts.map(contact => {
        let totalBilled = 0;
        let totalPaidOrReceived = 0;
        let direction = "";

        if (contact.type === "Mill") {
          // Total billed from purchases
          const contactPurchases = allPurchases.filter(p => p.supplierId === contact.id);
          for (const p of contactPurchases) {
            const totalKg = p.qtyBags * p.kgPerBag;
            const base = totalKg * parseFloat(p.ratePerKg);
            const gst = base * parseFloat(p.gstPct) / 100;
            totalBilled += base + gst + parseFloat(p.transport);
            totalPaidOrReceived += parseFloat(p.amountPaid);
          }
          // Add linked payments
          const paidPayments = allPayments.filter(pay => pay.partyId === contact.id && pay.direction === "Paid");
          totalPaidOrReceived += paidPayments.reduce((s, pay) => s + parseFloat(pay.amount), 0);
          direction = "Payable";
        } else if (contact.type === "Buyer") {
          const contactSales = allSales.filter(s => s.buyerId === contact.id);
          for (const s of contactSales) {
            const totalKg = s.qtyBags * s.kgPerBag;
            const base = totalKg * parseFloat(s.ratePerKg);
            const gst = base * parseFloat(s.gstPct) / 100;
            totalBilled += base + gst;
            totalPaidOrReceived += parseFloat(s.amountReceived);
          }
          const receivedPayments = allPayments.filter(pay => pay.partyId === contact.id && pay.direction === "Received");
          totalPaidOrReceived += receivedPayments.reduce((s, pay) => s + parseFloat(pay.amount), 0);
          direction = "Receivable";
        } else if (contact.type === "Broker") {
          // Commission from sales
          const brokerSales = allSales.filter(s => s.viaBroker && s.brokerId === contact.id);
          for (const s of brokerSales) {
            const totalKg = s.qtyBags * s.kgPerBag;
            const base = totalKg * parseFloat(s.ratePerKg);
            if (contact.brokerCommissionType === "per_bag") {
              totalBilled += s.qtyBags * parseFloat(contact.brokerCommissionValue ?? "0");
            } else if (contact.brokerCommissionType === "percentage") {
              totalBilled += base * parseFloat(contact.brokerCommissionValue ?? "0") / 100;
            }
          }
          const paidPayments = allPayments.filter(pay => pay.partyId === contact.id && pay.direction === "Paid");
          totalPaidOrReceived += paidPayments.reduce((s, pay) => s + parseFloat(pay.amount), 0);
          direction = "Payable";
        }

        const netBalance = totalBilled - totalPaidOrReceived;
        const status = netBalance <= 0 ? "Clear" : "Pending";
        if (netBalance < 0) direction = "Overpaid";

        // Calculate days since oldest unpaid transaction
        let oldestUnpaidDate: Date | null = null;
        if (contact.type === "Mill" && netBalance > 0) {
          const unpaid = allPurchases.filter(p => p.supplierId === contact.id)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          if (unpaid.length > 0) oldestUnpaidDate = new Date(unpaid[0].date);
        } else if (contact.type === "Buyer" && netBalance > 0) {
          const unpaid = allSales.filter(s => s.buyerId === contact.id)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          if (unpaid.length > 0) oldestUnpaidDate = new Date(unpaid[0].date);
        }

        const daysSinceOldest = oldestUnpaidDate
          ? Math.floor((Date.now() - oldestUnpaidDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          id: contact.id,
          name: contact.name,
          type: contact.type,
          totalBilled: Math.round(totalBilled * 100) / 100,
          totalPaidOrReceived: Math.round(totalPaidOrReceived * 100) / 100,
          netBalance: Math.round(netBalance * 100) / 100,
          direction,
          status,
          daysSinceOldest,
        };
      }).sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
    }),

  // Get detail for a specific party - all transactions + payments
  partyDetail: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contact = await ctx.db.select().from(contacts)
        .where(eq(contacts.id, input.contactId)).then(r => r[0]);
      if (!contact) return null;

      // Get all transactions involving this party
      let transactions: Array<{
        type: string;
        displayId: string;
        date: string;
        amount: number;
        description: string;
      }> = [];

      if (contact.type === "Mill") {
        const rows = await ctx.db.select().from(purchases)
          .where(and(eq(purchases.supplierId, input.contactId), isNull(purchases.deletedAt)));
        transactions = rows.map(p => {
          const totalKg = p.qtyBags * p.kgPerBag;
          const base = totalKg * parseFloat(p.ratePerKg);
          const gst = base * parseFloat(p.gstPct) / 100;
          const grand = base + gst + parseFloat(p.transport);
          return {
            type: "Purchase",
            displayId: p.displayId,
            date: p.date,
            amount: grand,
            description: `${p.qtyBags} bags @ Rs.${parseFloat(p.ratePerKg).toFixed(2)}/kg`,
          };
        });
      } else if (contact.type === "Buyer") {
        const rows = await ctx.db.select().from(sales)
          .where(and(eq(sales.buyerId, input.contactId), isNull(sales.deletedAt)));
        transactions = rows.map(s => {
          const totalKg = s.qtyBags * s.kgPerBag;
          const base = totalKg * parseFloat(s.ratePerKg);
          const gst = base * parseFloat(s.gstPct) / 100;
          return {
            type: "Sale",
            displayId: s.displayId,
            date: s.date,
            amount: base + gst,
            description: `${s.qtyBags} bags @ Rs.${parseFloat(s.ratePerKg).toFixed(2)}/kg`,
          };
        });
      } else if (contact.type === "Broker") {
        const rows = await ctx.db.select().from(sales)
          .where(and(eq(sales.brokerId, input.contactId), isNull(sales.deletedAt)));
        transactions = rows.filter(s => s.viaBroker).map(s => {
          const totalKg = s.qtyBags * s.kgPerBag;
          const base = totalKg * parseFloat(s.ratePerKg);
          let commission = 0;
          if (contact.brokerCommissionType === "per_bag") {
            commission = s.qtyBags * parseFloat(contact.brokerCommissionValue ?? "0");
          } else if (contact.brokerCommissionType === "percentage") {
            commission = base * parseFloat(contact.brokerCommissionValue ?? "0") / 100;
          }
          return {
            type: "Commission",
            displayId: s.displayId,
            date: s.date,
            amount: commission,
            description: `Commission on ${s.qtyBags} bags (${s.displayId})`,
          };
        });
      }

      // Get all payments for this party
      const partyPayments = await ctx.db.select().from(payments)
        .where(and(eq(payments.partyId, input.contactId), isNull(payments.deletedAt)));

      const paymentsList = partyPayments.map(p => ({
        type: "Payment",
        displayId: p.againstTxnId ?? "General",
        date: p.date,
        amount: parseFloat(p.amount),
        description: `${p.direction} via ${p.mode}${p.reference ? ` (${p.reference})` : ""}`,
      }));

      // Combine and sort by date descending
      const allEntries = [...transactions, ...paymentsList]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        contact,
        entries: allEntries,
      };
    }),
});
