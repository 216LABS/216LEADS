// GET /api/admin/metrics (issue #10): read-only JSON for reporting outside the app.
// Admin session, or a bearer METRICS_READ_TOKEN; 401 otherwise.
import { handle, json } from "@/lib/api";
import { metricsPayload, requireMetricsAccess } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireMetricsAccess(req);
  return json(await metricsPayload(), { headers: { "Cache-Control": "no-store" } });
});
