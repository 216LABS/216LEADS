// GET /api/admin/metrics/at-risk.csv and /api/admin/metrics/daily.csv (issue #10).
import { getSql } from "@216leads/db";
import { toCsv } from "@216leads/ingest";
import { todayEt } from "@216leads/shared";
import { ApiError, handle } from "@/lib/api";
import { metricsPayload, requireMetricsAccess } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ file: string }> }) => {
  await requireMetricsAccess(req);
  const { file } = await params;
  let csv: string;
  if (file === "at-risk.csv") {
    const { at_risk } = await metricsPayload();
    csv = toCsv(["org_id", "org", "plan", "billing_state", "last_activity", "reason", "owner_email"],
      at_risk.map((r) => [r.org_id, r.name, r.plan, r.billing_state, r.last_activity, r.reason, r.owner_email]));
  } else if (file === "daily.csv") {
    const rows = await getSql()<{ date: string; key: string; value: number }[]>`
      select date::text, key, value::float8 as value from metrics_daily order by date desc, key limit 20000`;
    csv = toCsv(["date", "key", "value"], rows.map((r) => [r.date, r.key, r.value]));
  } else throw new ApiError(404, "Not found");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="homesignal-${file.replace(".csv", "")}-${todayEt()}.csv"` },
  });
});
