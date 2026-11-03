// GET /api/roi?from&to (spec 8): metrics + attribution rows. Defaults to the current month.
import { getSql } from "@216leads/db";
import { proofRows, roiMetrics } from "@216leads/ingest";
import { ApiError, apiMarketOrg, handle, json } from "@/lib/api";
import { isIsoDate, monthRange } from "@/lib/roi";

export const GET = handle(async (req: Request) => {
  const { org } = await apiMarketOrg();
  const q = new URL(req.url).searchParams;
  const def = monthRange();
  const from = q.get("from") ?? def.from;
  const to = q.get("to") ?? def.to;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new ApiError(400, "from and to must be YYYY-MM-DD, from before to");
  const sql = getSql();
  return json({ metrics: await roiMetrics(sql, org.id, from, to), attribution: await proofRows(sql, org.id, from, to) });
});
