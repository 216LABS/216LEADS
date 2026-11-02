// GET/PUT /api/mail/rules (spec 8, 9.5): the org's auto-mail rule (one per org for now).
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { templateOf } from "@/lib/mail";

const Body = z.object({
  enabled: z.boolean(),
  template_id: z.string().uuid(),
  min_score: z.number().int().min(40).max(100),
  trigger_kinds: z.array(z.enum(["sale", "violation", "permit"])).min(1),
  max_per_week: z.number().int().min(1).max(500),
  monthly_cap_cents: z.number().int().min(0).max(1_000_000),
  followup_days: z.array(z.number().int().min(7).max(90)).max(2),
});

export const GET = handle(async () => {
  const { org } = await apiOrg();
  const [rule] = await getDirectSql()`
    select id, enabled, template_id, min_score, trigger_kinds::text[] as trigger_kinds, max_per_week, monthly_cap_cents, followup_days
    from mail_rule where org_id = ${org.id} order by created_at limit 1`;
  return json({ rule: rule ?? null });
});

export const PUT = handle(async (req: Request) => {
  const { org, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can change auto-mail");
  const b = await body(req, Body);
  const sql = getDirectSql();
  if (!(await templateOf(sql, org.id, b.template_id))) throw new ApiError(422, "Pick a postcard template");
  if (b.enabled && !org.return_address?.line1) throw new ApiError(422, "Add a return address in Settings first.");
  const [existing] = await sql<{ id: string }[]>`select id from mail_rule where org_id = ${org.id} order by created_at limit 1`;
  if (existing) {
    await sql`
      update mail_rule set enabled = ${b.enabled}, template_id = ${b.template_id}, min_score = ${b.min_score}, trigger_kinds = ${b.trigger_kinds}::event_kind[],
        max_per_week = ${b.max_per_week}, monthly_cap_cents = ${b.monthly_cap_cents}, followup_days = ${b.followup_days}
      where id = ${existing.id}`;
  } else {
    await sql`
      insert into mail_rule (org_id, template_id, enabled, min_score, trigger_kinds, max_per_week, monthly_cap_cents, followup_days)
      values (${org.id}, ${b.template_id}, ${b.enabled}, ${b.min_score}, ${b.trigger_kinds}::event_kind[], ${b.max_per_week}, ${b.monthly_cap_cents}, ${b.followup_days})`;
  }
  return json({ ok: true });
});
