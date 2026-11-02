// Nightly feedback loop (spec 7.6, Addendum A6): learned weight factors from the org's won/lost/
// skipped leads. A nudge is saved as a new recipe version (source = feedback) whose weights are the
// base recipe's times the factors. The base is the last version a person chose (never a feedback
// one), so nudges are always measured from it and never compound night after night.
import type { Sql } from "@216leads/db";
import { learnWeights, signalLabel, type LearnedResult, type Outcome, type Template } from "@216leads/scoring";
import { withJobRun } from "./runtime";
import { loadHomes, loadOrgProfile } from "./score";
import { activateRecipeVersion, activeRecipe, ensurePresetVersion, saveRecipeVersion, type RecipeVersionRow } from "./recipes";

/** The version learning starts from: the active one, or its parent when the active one is a nudge. */
export async function baseRecipe(sql: Sql, orgId: string): Promise<RecipeVersionRow | null> {
  const active = await activeRecipe(sql, orgId);
  if (!active || active.source !== "feedback" || !active.parent_id) return active;
  const [parent] = await sql<RecipeVersionRow[]>`
    select id, recipe, multipliers, source::text as source, parent_id, note, created_at, active
    from recipe_version where id = ${active.parent_id} and org_id = ${orgId}`;
  return parent ?? active;
}

/** Base weights times the factors, as whole numbers inside the recipe's 0-40 range. */
export function nudgedRecipe(base: Template, factors: Record<string, number>): Template {
  const signals = Object.fromEntries(Object.entries(base.signals).map(([k, s]) => [
    k, { ...s, weight: Math.min(40, Math.max(0, Math.round(s.weight * (factors[k] ?? 1)))) },
  ]));
  return { ...base, signals };
}

const sameWeights = (a: Template, b: Template) =>
  Object.keys(a.signals).length === Object.keys(b.signals).length &&
  Object.entries(a.signals).every(([k, s]) => b.signals[k]?.weight === s.weight);

export async function learnOrg(sql: Sql, orgId: string): Promise<LearnedResult & { versionId: string | null }> {
  const [sp] = await sql<{ learned_since: string | null; trade: string }[]>`
    select sp.learned_since, o.trade from scoring_profile sp join org o on o.id = sp.org_id where sp.org_id = ${orgId}`;
  if (!sp) return { weights: {}, meta: {}, outcomes: 0, versionId: null };
  await ensurePresetVersion(sql, orgId, sp.trade);
  const base = await baseRecipe(sql, orgId);
  const active = await activeRecipe(sql, orgId);
  const leads = await sql<{ parcel_key: string; status: Outcome }[]>`
    select parcel_key, status::text as status from lead
    where org_id = ${orgId} and status in ('won', 'lost', 'skipped')
      and (${sp.learned_since}::timestamptz is null or status_changed_at >= ${sp.learned_since}::timestamptz)`;
  const { profile } = await loadOrgProfile(sql, orgId);
  let result: LearnedResult = { weights: {}, meta: {}, outcomes: leads.length };
  if (leads.length && base) {
    const want = new Map(leads.map((l) => [l.parcel_key, l.status]));
    const homes = (await loadHomes(sql, { orgId })).filter((h) => want.has(h.input.parcel.parcel_key));
    result = learnWeights(base.recipe, { ...profile, learned_weights: {} },
      homes.map((h) => ({ input: h.input, outcome: want.get(h.input.parcel.parcel_key)! })));
  }

  let versionId = active?.id ?? null;
  if (base) {
    const target = nudgedRecipe(base.recipe, result.weights);
    if (sameWeights(target, base.recipe)) {
      // Nothing to nudge (too few outcomes, or wins and losses look alike): back to the base.
      if (active && active.id !== base.id && active.source === "feedback") versionId = (await activateRecipeVersion(sql, orgId, base.id)).id;
    } else if (!active || active.source !== "feedback" || active.parent_id !== base.id || !sameWeights(target, active.recipe)) {
      const note = Object.entries(result.weights).map(([k, f]) => `${signalLabel(k)} ${f > 1 ? "up" : "down"} (x${f})`).join(", ");
      versionId = (await saveRecipeVersion(sql, {
        orgId, recipe: target, multipliers: base.multipliers, source: "feedback", parentId: base.id,
        note: `Learned from ${result.outcomes} outcomes: ${note}`.slice(0, 500), activate: true,
      })).id;
    }
  }
  // The factors live in the feedback recipe's weights now, so the engine's own multiplier stays empty.
  await sql`
    update scoring_profile set learned_weights = '{}'::jsonb, learned_meta = ${sql.json(result.meta as never)}, updated_at = now()
    where org_id = ${orgId} and (learned_weights <> '{}'::jsonb or learned_meta is distinct from ${sql.json(result.meta as never)}::jsonb)`;
  return { ...result, versionId };
}

/** Settings "Reset": back to the base recipe, and learn only from outcomes after now. */
export async function resetLearned(sql: Sql, orgId: string) {
  const base = await baseRecipe(sql, orgId);
  const active = await activeRecipe(sql, orgId);
  if (base && active && active.id !== base.id && active.source === "feedback") await activateRecipeVersion(sql, orgId, base.id);
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
