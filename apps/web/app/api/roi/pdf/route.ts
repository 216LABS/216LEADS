// GET /api/roi/pdf?month=YYYY-MM: the downloadable monthly ROI report (spec 9.6).
import { getSql } from "@216leads/db";
import { monthlySeries, proofRows, roiMetrics, roiPdf } from "@216leads/ingest";
import { apiMarketOrg, handle } from "@/lib/api";
import { monthRange } from "@/lib/roi";

export const GET = handle(async (req: Request) => {
  const { org } = await apiMarketOrg();
  const r = monthRange(new URL(req.url).searchParams.get("month"));
  const sql = getSql();
  const [metrics, series, proof] = await Promise.all([roiMetrics(sql, org.id, r.from, r.to), monthlySeries(sql, org.id), proofRows(sql, org.id, r.from, r.to, 18)]);
  const pdf = await roiPdf({ orgName: org.name, month: r.month, metrics, series, proof });
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="216-leads-roi-${r.month}.pdf"`, "Cache-Control": "no-store" },
  });
});
