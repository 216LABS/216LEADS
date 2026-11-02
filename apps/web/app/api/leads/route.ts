// GET /api/leads?view&status&min_score&chips&zip&q&sort&page (spec 8): the lead list, 50 a page.
import { apiOrg, handle, json } from "@/lib/api";
import { leadQueryFromParams, listLeads } from "@/lib/leads";

export const GET = handle(async (req: Request) => {
  const { org } = await apiOrg();
  return json(await listLeads(org.id, leadQueryFromParams(new URL(req.url).searchParams)));
});
