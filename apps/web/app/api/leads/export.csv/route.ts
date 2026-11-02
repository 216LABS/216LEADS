// GET /api/leads/export.csv (spec 8): the current list (same filters as the page) or ?ids=...
// Address, city, zip, score, trigger, reasons, status; never names. 2,000 rows/day per org (spec 13).
import { BRAND, CSV_DAILY_ROW_CAP, todayEt } from "@216leads/shared";
import { ApiError, apiActiveOrg, handle } from "@/lib/api";
import { exportAllowance, exportLeadsCsv, leadQueryFromParams } from "@/lib/leads";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const { org } = await apiActiveOrg();
  const sp = new URL(req.url).searchParams;
  const left = await exportAllowance(org.id, CSV_DAILY_ROW_CAP);
  if (left <= 0) throw new ApiError(429, `You've exported ${CSV_DAILY_ROW_CAP.toLocaleString("en-US")} rows today. The limit resets at midnight.`);
  const ids = (sp.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  const { csv, rows } = await exportLeadsCsv(org.id, { ...leadQueryFromParams(sp), ids }, left, BRAND.disclaimer);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="216-leads-${todayEt()}.csv"`,
      "X-Rows": String(rows),
      "X-Rows-Left-Today": String(left - rows),
    },
  });
});
