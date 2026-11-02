// Dev tool: time spec 7.7 (an org of 50K+ homes scored in under 5 s, single SQL + TS pass).
//   pnpm --filter @216leads/ingest exec tsx src/tools/bench-score.ts [trade] [zip,zip,...]
// Creates a throwaway org on the local DB, scores it cold (all inserts) and warm (incremental),
// then deletes it. Nothing else is touched.
import { closeAll, getDirectSql } from "@216leads/db";
import { scoreOrg } from "../score";

const trade = process.argv[2] ?? "roofing";
const zips = (process.argv[3] ?? "44130,44107,44111,44134").split(",");
const sql = getDirectSql();
const id = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Bench (temporary)', ${trade}) returning id`)[0]!.id;
try {
  for (const z of zips) await sql`insert into territory (org_id, kind, zip) values (${id}, 'zip', ${z})`;
  const cold = await scoreOrg(sql, id);
  const warm = await scoreOrg(sql, id);
  console.log(JSON.stringify({ trade, zips, cold, warm }, null, 2));
  if (cold.homes < 50_000) console.warn(`only ${cold.homes} homes in scope; add ZIPs to reach 50K`);
} finally {
  await sql`delete from org where id = ${id}`;
  await closeAll();
}
