import { router, protectedProcedure } from "../trpc";
import { contacts, products, purchases, sales, payments, ccEntries } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const exportRouter = router({
  allData: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.tenantId;

    const [contactsData, productsData, purchasesData, salesData, paymentsData, ccData] = await Promise.all([
      ctx.db.select().from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt))),
      ctx.db.select().from(products).where(and(eq(products.tenantId, tid), isNull(products.deletedAt))),
      ctx.db.select().from(purchases).where(and(eq(purchases.tenantId, tid), isNull(purchases.deletedAt))),
      ctx.db.select().from(sales).where(and(eq(sales.tenantId, tid), isNull(sales.deletedAt))),
      ctx.db.select().from(payments).where(and(eq(payments.tenantId, tid), isNull(payments.deletedAt))),
      ctx.db.select().from(ccEntries).where(eq(ccEntries.tenantId, tid)),
    ]);

    return {
      contacts: contactsData.map(c => ({
        Name: c.name,
        Type: c.type,
        Phone: c.phone ?? "",
        City: c.city ?? "",
        BrokerCommType: c.brokerCommissionType ?? "",
        BrokerCommValue: c.brokerCommissionValue ?? "",
        TransporterRate: c.transporterRatePerBag ?? "",
        Notes: c.notes ?? "",
        CreatedAt: c.createdAt?.toISOString() ?? "",
      })),
      products: productsData.map(p => ({
        MillBrand: p.millBrand,
        FibreType: p.fibreType,
        Count: p.count,
        QualityGrade: p.qualityGrade,
        Active: p.active ? "Yes" : "No",
        CreatedAt: p.createdAt?.toISOString() ?? "",
      })),
      purchases: purchasesData.map(p => ({
        DisplayId: p.displayId,
        Date: p.date,
        QtyBags: p.qtyBags,
        KgPerBag: p.kgPerBag,
        RatePerKg: p.ratePerKg,
        GstPct: p.gstPct,
        Transport: p.transport,
        AmountPaid: p.amountPaid,
        CreatedAt: p.createdAt?.toISOString() ?? "",
      })),
      sales: salesData.map(s => ({
        DisplayId: s.displayId,
        Date: s.date,
        QtyBags: s.qtyBags,
        KgPerBag: s.kgPerBag,
        RatePerKg: s.ratePerKg,
        GstPct: s.gstPct,
        Transport: s.transport,
        AmountReceived: s.amountReceived,
        CreatedAt: s.createdAt?.toISOString() ?? "",
      })),
      payments: paymentsData.map(p => ({
        Date: p.date,
        Direction: p.direction,
        Amount: p.amount,
        Mode: p.mode,
        AgainstTxn: p.againstTxnId ?? "",
        Reference: p.reference ?? "",
        Notes: p.notes ?? "",
        CreatedAt: p.createdAt?.toISOString() ?? "",
      })),
      ccEntries: ccData.map(c => ({
        Date: c.date,
        Event: c.event,
        Amount: c.amount,
        RunningBalance: c.runningBalance,
        Notes: c.notes ?? "",
        CreatedAt: c.createdAt?.toISOString() ?? "",
      })),
    };
  }),
});
