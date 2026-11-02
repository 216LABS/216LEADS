// GET /api/parcels/:key/neighbors?radius_m=150&limit=40 (spec 8): the neighbor ring around a job.
import { getDirectSql } from "@216leads/db";
import { neighborRing, RING_LIMIT, RING_RADIUS_M } from "@216leads/ingest";
import { ApiError, apiMarketOrg, handle, json } from "@/lib/api";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const { org } = await apiMarketOrg();
  const key = decodeURIComponent((await params).key);
  const sp = new URL(req.url).searchParams;
  const ring = await neighborRing(getDirectSql(), org.id, key, {
    radiusM: Number(sp.get("radius_m")) || RING_RADIUS_M, limit: Number(sp.get("limit")) || RING_LIMIT,
  });
  if (!ring) throw new ApiError(404, "That home isn't in your area");
  return json(ring);
});
