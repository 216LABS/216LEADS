// POST /api/admin/metrics/settings (issue #10): monthly data + infra cost and at-risk thresholds.
import { z } from "zod";
import { getSql } from "@216leads/db";
import { setAdminSetting } from "@216leads/ingest";
import { body, handle, json } from "@/lib/api";
import { requireAdminApi } from "@/lib/imports";

const Body = z.object({
  monthly_cost: z.number().min(0).max(1_000_000).nullable(),
  inactive_days: z.number().int().min(1).max(120),
  unopened_weeks: z.number().int().min(1).max(12),
});

export const POST = handle(async (req: Request) => {
  await requireAdminApi();
  const b = await body(req, Body);
  const sql = getSql();
  await setAdminSetting(sql, "monthly_cost", { monthly_cost_cents: b.monthly_cost === null ? null : Math.round(b.monthly_cost * 100) });
  await setAdminSetting(sql, "at_risk", { inactiveDays: b.inactive_days, unopenedWeeks: b.unopened_weeks });
  return json({ ok: true });
});
