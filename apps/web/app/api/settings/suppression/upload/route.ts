// POST /api/settings/suppression/upload (spec 8): current customers to hide. The browser sends
// only "street, ZIP" lines (decision 46); matching homes drop out of the lead list on re-score.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { CUSTOMER_LINES_MAX, importCustomers, scoreOrg } from "@216leads/ingest";
import { apiOrg, body, handle, json } from "@/lib/api";

const Body = z.object({ lines: z.array(z.string().max(200)).min(1).max(CUSTOMER_LINES_MAX) });

export const POST = handle(async (req: Request) => {
  const { org } = await apiOrg();
  const { lines } = await body(req, Body);
  const sql = getDirectSql();
  const r = await importCustomers(sql, org.id, lines);
  // Customers already on the list as untouched "new" leads go away on re-score.
  const stats = await scoreOrg(sql, org.id);
  return json({ ...r, leads: stats.qualified });
});
