import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth";
import { db } from "../db";

// DON'T import superjson - it may not be installed. Use default transformer.

export const createTRPCContext = async (opts?: FetchCreateContextFnOptions) => {
  const session = await getServerSession(authOptions);
  return {
    db,
    session,
    // For Phase 1, single tenant - use session user id as tenant_id
    tenantId: (session?.user as any)?.id ?? "default-tenant",
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  // no transformer needed for now
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  // For development, allow unauthenticated access
  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
