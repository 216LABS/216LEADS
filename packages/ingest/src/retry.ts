// `match` job: retry unmatched records daily for 14 days (spec 6, step 5). After that they
// stay in unmatched_record for /admin/unmatched.
import type { Sql } from "@216leads/db";
import { matchBatch, type MatchInput } from "./match";
import { withJobRun } from "./runtime";

export async function runMatchRetry(sql: Sql) {
  return withJobRun(sql, { job: "match" }, async (ctx) => {
    const rows = await sql<{ id: number; source: string; source_record_id: string; payload: { _match?: MatchInput } }[]>`
      select id, source, source_record_id, payload from unmatched_record
      where created_at >= now() - interval '14 days' order by id limit 20000`;
    ctx.rowsIn = rows.length;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).filter((r) => r.payload?._match);
      const res = await matchBatch(sql, chunk.map((r) => r.payload._match!));
      const hits = chunk.map((r, j) => ({ r, m: res[j] })).filter((x) => x.m);
      for (const { r, m } of hits) {
        await sql`
          update parcel_event set parcel_key = ${m!.parcel_key}, match_method = ${m!.method}, match_confidence = ${m!.confidence}
          where source = ${r.source} and source_record_id = ${r.source_record_id} and parcel_key is null`;
        await sql`delete from unmatched_record where id = ${r.id}`;
      }
      ctx.rowsUpserted += hits.length;
      const missIds = chunk.filter((_, j) => !res[j]).map((r) => r.id);
      if (missIds.length) await sql`update unmatched_record set attempts = attempts + 1, last_error = 'no match' where id = any(${missIds})`;
    }
    ctx.rowsUnmatched = rows.length - ctx.rowsUpserted;
  });
}
