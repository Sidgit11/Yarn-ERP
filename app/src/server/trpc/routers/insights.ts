import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { loadCoachingData } from "../../services/coachingDb";
import {
  findUnderpricedSales,
  buyerScorecard,
  agingLots,
  marginTrend,
} from "../../services/coaching";

const rangeInput = z.object({ from: z.string().optional(), to: z.string().optional() }).optional();

export const insightsRouter = router({
  getAll: protectedProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    const d = await loadCoachingData(ctx.db, ctx.tenantId, input ?? {});
    const floorFor = (pid: string) => d.floorByProduct.get(pid) ?? d.autoFloorPct;
    return {
      businessAvgPct: d.businessAvgPct,
      autoFloorPct: d.autoFloorPct,
      globalOverride: d.globalOverride,
      underpriced: findUnderpricedSales(d.windowSales, floorFor),
      buyers: buyerScorecard(d.windowSales, d.businessAvgPct),
      aging: agingLots(d.remainingLots, d.today),
      trends: marginTrend(d.windowSales, d.productNames),
    };
  }),
});
