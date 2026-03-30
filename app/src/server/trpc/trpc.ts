import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth";
import { db } from "../db";

export const createTRPCContext = async (opts?: FetchCreateContextFnOptions) => {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.id ?? null;

  return {
    db,
    session,
    tenantId,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user || !ctx.tenantId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId as string,
    },
  });
});

// Timing middleware — logs how long each procedure takes
const timingLogger = t.middleware(async ({ path, next }) => {
  const start = performance.now();
  const result = await next();
  const ms = (performance.now() - start).toFixed(1);
  console.log(`[tRPC] ${path} — ${ms}ms`);
  return result;
});

export const protectedProcedure = t.procedure.use(timingLogger).use(enforceAuth);
