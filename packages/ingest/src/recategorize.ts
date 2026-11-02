// `recategorize` job: re-run the category regex over stored permits and violations after
// templates/categories.yaml changes. Only rows whose category changes are written.
import type { Sql } from "@216leads/db";
import { categorize } from "@216leads/scoring";
import { withJobRun } from "./runtime";

export async function runRecategorize(sql: Sql) {
  return withJobRun(sql, { job: "recategorize" }, async (ctx) => {
    let lastId = 0;
    for (;;) {
      const rows = await sql<{ id: number; raw_type: string | null; description: string | null; category: string | null; source: string }[]>`
        select id, raw_type, description, category, source from parcel_event
        where id > ${lastId} and kind in ('permit', 'violation') order by id limit 20000`;
      if (!rows.length) break;
      lastId = rows[rows.length - 1]!.id;
      ctx.rowsIn += rows.length;
      const changed = rows
        .map((r) => ({ id: r.id, category: categorize(r.raw_type, r.description) }))
        .filter((r, i) => r.category !== rows[i]!.category);
      if (changed.length) {
        await sql`
          update parcel_event e set category = x.category
          from jsonb_to_recordset(${sql.json(changed as never)}) as x(id bigint, category text)
          where e.id = x.id`;
        ctx.rowsUpserted += changed.length;
      }
    }
  });
}
