// Recipe versions (Addendum A6). Every change to an org's scoring recipe is a new row; exactly
// one is active. Presets, the wizard, "tweak it", sliders and the feedback loop all save here.
import type { Sql } from "@216leads/db";
import { getTemplate, hasTemplate, parseRecipe, type Template } from "@216leads/scoring";

export type RecipeSource = "wizard" | "tweak" | "slider" | "feedback" | "preset";

export interface RecipeVersionRow {
  id: string;
  recipe: Template & { preset_base?: string | null; rationale?: string[] };
  multipliers: Record<string, number>;
  source: RecipeSource;
  parent_id: string | null;
  note: string | null;
  created_at: string;
  active: boolean;
}

export async function activeRecipe(sql: Sql, orgId: string): Promise<RecipeVersionRow | null> {
  const [row] = await sql<RecipeVersionRow[]>`
    select id, recipe, multipliers, source::text as source, parent_id, note, created_at, active
    from recipe_version where org_id = ${orgId} and active`;
  return row ?? null;
}

export async function listRecipeVersions(sql: Sql, orgId: string, limit = 50): Promise<RecipeVersionRow[]> {
  return sql<RecipeVersionRow[]>`
    select id, recipe, multipliers, source::text as source, parent_id, note, created_at, active
    from recipe_version where org_id = ${orgId} order by created_at desc limit ${limit}`;
}

export class RecipeInvalidError extends Error {
  constructor(public errors: string[]) {
    super(`Invalid recipe: ${errors.slice(0, 3).join("; ")}`);
  }
}

/**
 * Validate and store a recipe version; when `activate`, it becomes the one scoring uses and its
 * multipliers become the org's slider settings.
 */
export async function saveRecipeVersion(
  sql: Sql,
  v: {
    orgId: string;
    recipe: unknown;
    multipliers?: Record<string, number>;
    source: RecipeSource;
    parentId?: string | null;
    note?: string | null;
    userId?: string | null;
    activate?: boolean;
  },
): Promise<RecipeVersionRow> {
  const parsed = parseRecipe(v.recipe);
  if (!parsed.ok) throw new RecipeInvalidError(parsed.errors);
  const recipe = parsed.recipe as RecipeVersionRow["recipe"];
  const multipliers = Object.fromEntries(
    Object.entries(v.multipliers ?? {}).filter(([k, m]) => k in recipe.signals && Number.isFinite(m) && m >= 0 && m <= 2),
  );
  return sql.begin(async (tx) => {
    if (v.activate) await tx`update recipe_version set active = false where org_id = ${v.orgId} and active`;
    const [row] = await tx<RecipeVersionRow[]>`
      insert into recipe_version (org_id, recipe, multipliers, source, parent_id, note, created_by, active)
      values (${v.orgId}, ${tx.json(recipe as never)}, ${tx.json(multipliers as never)}, ${v.source}::recipe_source,
        ${v.parentId ?? null}, ${v.note ?? null}, ${v.userId ?? null}, ${v.activate ?? false})
      returning id, recipe, multipliers, source::text as source, parent_id, note, created_at, active`;
    if (v.activate) await syncProfile(tx as unknown as Sql, v.orgId, recipe, multipliers);
    return row!;
  });
}

/** Make an existing version the active one (Settings → revert). */
export async function activateRecipeVersion(sql: Sql, orgId: string, versionId: string): Promise<RecipeVersionRow> {
  return sql.begin(async (tx) => {
    const [row] = await tx<RecipeVersionRow[]>`
      select id, recipe, multipliers, source::text as source, parent_id, note, created_at, active
      from recipe_version where id = ${versionId} and org_id = ${orgId}`;
    if (!row) throw new Error("Recipe version not found");
    await tx`update recipe_version set active = false where org_id = ${orgId} and active`;
    await tx`update recipe_version set active = true where id = ${versionId}`;
    await syncProfile(tx as unknown as Sql, orgId, row.recipe, row.multipliers);
    return { ...row, active: true };
  });
}

async function syncProfile(sql: Sql, orgId: string, recipe: RecipeVersionRow["recipe"], multipliers: Record<string, number>) {
  const key = recipe.preset_base && hasTemplate(recipe.preset_base) ? recipe.preset_base : recipe.key;
  await sql`
    insert into scoring_profile (org_id, template_key, template_version, weights)
    values (${orgId}, ${key}, ${recipe.version}, ${sql.json(multipliers as never)})
    on conflict (org_id) do update set template_key = excluded.template_key, template_version = excluded.template_version,
      weights = excluded.weights, updated_at = now()`;
}

/** Give an org its trade preset as version 1 so Settings always has a version to return to. */
export async function ensurePresetVersion(sql: Sql, orgId: string, trade: string): Promise<void> {
  const [has] = await sql`select 1 from recipe_version where org_id = ${orgId} limit 1`;
  if (has || !hasTemplate(trade)) return;
  await saveRecipeVersion(sql, { orgId, recipe: getTemplate(trade), source: "preset", note: "Starting preset", activate: true });
}

export const LOW_CONFIDENCE_MIN = 20;

/** Real permit matches per category (Addendum A5): fewer than 20 = low confidence in the UI. */
export async function categoryMatchCounts(sql: Sql): Promise<Record<string, { count: number; low_confidence: boolean }>> {
  const rows = await sql<{ category: string; n: number }[]>`
    select category, count(*)::int as n from parcel_event where kind = 'permit' and category is not null group by category`;
  return Object.fromEntries(rows.map((r) => [r.category, { count: r.n, low_confidence: r.n < LOW_CONFIDENCE_MIN }]));
}
