// GET /api/map/layer?kind=permit|sale|violation|flood&days&category&bbox (spec 9.3 layers).
// Record layers cover the org's area; flood zones need a bbox (the map sends its area's extent).
import { getDirectSql } from "@216leads/db";
import { bboxTooLarge, eventLayer, floodZones, LAYER_KINDS, parseBbox, type LayerKind } from "@216leads/ingest";
import { ApiError, apiMarketOrg, handle, json } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  const { org } = await apiMarketOrg();
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") ?? "";
  const bbox = parseBbox(sp.get("bbox"));
  const sql = getDirectSql();
  if (kind === "flood") {
    if (!bbox || bboxTooLarge(bbox)) throw new ApiError(400, "Zoom in to see flood zones");
    return json(await floodZones(sql, bbox));
  }
  if (!LAYER_KINDS.includes(kind as LayerKind)) throw new ApiError(400, "Unknown layer");
  const category = /^[a-z_]{2,30}$/.test(sp.get("category") ?? "") ? sp.get("category") : null;
  return json(await eventLayer(sql, org.id, { kind: kind as LayerKind, bbox, days: Number(sp.get("days")) || 90, category }));
});
