import { router } from "./trpc";
import { contactsRouter } from "./routers/contacts";
import { productsRouter } from "./routers/products";
import { purchasesRouter } from "./routers/purchases";
import { salesRouter } from "./routers/sales";
import { paymentsRouter } from "./routers/payments";
import { ccRouter } from "./routers/cc";
import { configRouter } from "./routers/config";
import { ledgerRouter } from "./routers/ledger";
import { reconRouter } from "./routers/recon";
import { dashboardRouter } from "./routers/dashboard";

export const appRouter = router({
  contacts: contactsRouter,
  products: productsRouter,
  purchases: purchasesRouter,
  sales: salesRouter,
  payments: paymentsRouter,
  cc: ccRouter,
  config: configRouter,
  ledger: ledgerRouter,
  recon: reconRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
