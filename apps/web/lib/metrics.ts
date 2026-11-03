// Access and data for /admin/metrics (issue #10): admin session, or a read-only bearer token.
import { createHash, timingSafeEqual } from "node:crypto";
import { getSql } from "@216leads/db";
import { adminSetting, AT_RISK_DEFAULTS, atRiskOrgs, businessMetrics, metricsSeries, type AtRiskConfig } from "@216leads/ingest";
import { ApiError } from "@/lib/api";
import { requireAdminApi } from "@/lib/imports";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Admin session or `Authorization: Bearer <METRICS_READ_TOKEN>` (compared in constant time). */
export async function requireMetricsAccess(req: Request): Promise<void> {
  const token = process.env.METRICS_READ_TOKEN;
  const given = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token && given) {
    if (timingSafeEqual(digest(given), digest(token))) return;
    throw new ApiError(401, "Bad token");
  }
  try {
    await requireAdminApi();
  } catch {
    throw new ApiError(401, "Sign in as an admin or send the metrics token");
  }
}

export async function metricsPayload() {
  const sql = getSql();
  const cfg = await adminSetting<AtRiskConfig>(sql, "at_risk", AT_RISK_DEFAULTS);
  const [metrics, atRisk, series] = await Promise.all([
    businessMetrics(sql),
    atRiskOrgs(sql, cfg, { openTracking: !!process.env.RESEND_WEBHOOK_SECRET }),
    metricsSeries(sql, ["mrr", "active_orgs"], 90),
  ]);
  return { metrics, at_risk: atRisk, at_risk_config: cfg, open_tracking: !!process.env.RESEND_WEBHOOK_SECRET, series };
}
