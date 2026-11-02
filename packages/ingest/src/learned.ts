// Nightly feedback loop (spec 7.6): learned weight factors from the org's won/lost/skipped leads.
import type { Sql } from "@216leads/db";
import { learnWeights, type LearnedResult, type Outcome } from "@216leads/scoring";
import { withJobRun } from "./runtime";
import { loadHomes, loadOrgProfile } from "./score";

export async function learnOrg(sql: Sql, orgId: string): Promise<LearnedResult> {
  const [sp] = await sql<{ learned_since: string | null }[]>`select learned_since from scoring_profile where org_id = ${orgId}`;
  if (!sp) return { weights: {}, meta: {}, outcomes: 0 };
  const leads = await sql<{ parcel_key: string; status: Outcome }[]>`
    select parcel_key, status::text as status from lead
    where org_id = ${orgId} and status in ('won', 'lost', 'skipped')
      and (${sp.learned_since}::timestamptz is null or status_changed_at >= ${sp.learned_since}::timestamptz)`;
  const { template, profile } = await loadOrgProfile(sql, orgId);
  let result: LearnedResult = { weights: {}, meta: {}, outcomes: leads.length };
  if (leads.length) {
    const want = new Map(leads.map((l) => [l.parcel_key, l.status]));
    const homes = (await loadHomes(sql, { orgId })).filter((h) => want.has(h.input.parcel.parcel_key));
    // Learn against the template weights alone, so last night's factors don't feed tonight's.
    result = learnWeights(template, { ...profile, learned_weights: {} },
      homes.map((h) => ({ input: h.input, outcome: want.get(h.input.parcel.parcel_key)! })));
  }
  await sql`
    update scoring_profile set learned_weights = ${sql.json(result.weights)}, learned_meta = ${sql.json(result.meta as never)}, updated_at = now()
    where org_id = ${orgId} and (learned_weights, learned_meta) is distinct from (${sql.json(result.weights)}::jsonb, ${sql.json(result.meta as never)}::jsonb)`;
  return result;
}

/** Settings "Reset": drop the factors and learn only from outcomes after now. */
export async function resetLearned(sql: Sql, orgId: string) {
  await sql`update scoring_profile set learned_weights = '{}'::jsonb, learned_meta = '{}'::jsonb, learned_since = now(), updated_at = now()
    where org_id = ${orgId}`;
}

export async function learnedFor(sql: Sql, orgId: string) {
  const [r] = await sql<{ learned_weights: Record<string, number>; learned_meta: Record<string, { won: number; lost: number; factor: number }>; learned_since: string | null }[]>`
    select learned_weights, learned_meta, learned_since from scoring_profile where org_id = ${orgId}`;
  return r ?? { learned_weights: {}, learned_meta: {}, learned_since: null };
}

export async function runLearned(sql: Sql, onlyOrg?: string) {
  return withJobRun(sql, { job: "learned_weights" }, async (ctx) => {
    const orgs = onlyOrg ? [{ id: onlyOrg }] : await sql<{ id: string }[]>`
      select o.id from org o where o.onboarded_at is not null and o.plan <> 'canceled'
        and exists (select 1 from lead l where l.org_id = o.id and l.status in ('won', 'lost', 'skipped'))`;
    for (const o of orgs) {
      const r = await learnOrg(sql, o.id);
      ctx.rowsIn += r.outcomes;
      if (Object.keys(r.weights).length) ctx.rowsUpserted++;
    }
  });
}
