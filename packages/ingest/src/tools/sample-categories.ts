// Dev tool: sample real permit text per predicted category for the spec 7.3 fixture.
//   pnpm --filter @216leads/ingest exec tsx src/tools/sample-categories.ts [source] > rows.json
// Each row starts with expected = sampled_as; a human review then corrects the wrong ones.
import { closeAll, getDirectSql } from "@216leads/db";
import { CATEGORY_KEYS, categorize } from "@216leads/scoring";

const HINT: Record<string, string> = {
  fence_deck: "fenc|deck|porch", waterproof: "waterproof|sump|basement wall|drain tile|foundation",
  concrete: "driveway|concrete|apron|flatwork|sidewalk", new_build: "famil|townh|residence|new constr|dwelling|new home",
  occupancy: "establish|change of use", elevator: "elevat|hoist|escalat|lift", signage: "sign|awning|tent|banner",
  boardup: "board", tree: "tree|stump", windows: "window|door",
};

const source = process.argv[2] ?? "cle_permits";
const sql = getDirectSql();
const out: { sampled_as: string; raw_type: string; description: string; expected: string | null }[] = [];
for (const cat of CATEGORY_KEYS) {
  const rows = await sql<{ raw_type: string | null; description: string | null }[]>`
    select raw_type, description from parcel_event
    where source = ${source} and (raw_type || ' ' || coalesce(description, '')) ~* ${HINT[cat] ?? cat.slice(0, 4)}
    order by md5(source_record_id) limit 4000`;
  const hits = rows
    .map((r) => ({ raw_type: r.raw_type ?? "", description: (r.description ?? "").replace(/\s+/g, " ").slice(0, 300) }))
    .filter((r) => categorize(r.raw_type, r.description) === cat)
    .slice(0, 50);
  for (const h of hits) out.push({ sampled_as: cat, ...h, expected: cat });
}
console.log(JSON.stringify(out, null, 1));
await closeAll();
