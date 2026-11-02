// GET /api/competitors?days=90&category (spec 8): businesses pulling permits in the org's area.
import { getDirectSql } from "@216leads/db";
import { competitors } from "@216leads/ingest";
import { apiMarketOrg, handle, json } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  const { org } = await apiMarketOrg();
  const sp = new URL(req.url).searchParams;
  const category = /^[a-z_]{2,30}$/.test(sp.get("category") ?? "") ? sp.get("category") : null;
  return json(await competitors(getDirectSql(), org.id, { days: Number(sp.get("days")) || 90, category }));
});
