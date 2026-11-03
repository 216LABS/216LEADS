// GET /api/map/heat?bbox&kind&category&days (spec 8): grid counts of public records in the org's area.
import { getSql } from "@216leads/db";
import { heatGrid, LAYER_KINDS, parseBbox, type LayerKind } from "@216leads/ingest";
import { apiMarketOrg, handle, json } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  const { org } = await apiMarketOrg();
  const sp = new URL(req.url).searchParams;
  const kind = (LAYER_KINDS.includes(sp.get("kind") as LayerKind) ? sp.get("kind") : "permit") as LayerKind;
  const category = /^[a-z_]{2,30}$/.test(sp.get("category") ?? "") ? sp.get("category") : null;
  const cells = await heatGrid(getSql(), org.id, { kind, bbox: parseBbox(sp.get("bbox")), days: Number(sp.get("days")) || 90, category });
  return json({ kind, cells });
});
