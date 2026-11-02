// GET /api/map/points?bbox&min_score (spec 8): GeoJSON of the org's leads, at most 5,000.
import { getDirectSql } from "@216leads/db";
import { mapPoints, parseBbox } from "@216leads/ingest";
import { apiMarketOrg, handle, json } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  const { org } = await apiMarketOrg();
  const sp = new URL(req.url).searchParams;
  const minScore = Math.min(100, Math.max(0, Number(sp.get("min_score")) || 0));
  return json(await mapPoints(getDirectSql(), org.id, { bbox: parseBbox(sp.get("bbox")), minScore }));
});
