// Job bookkeeping: `source` rows and `job_run` rows with counts (spec 0003).
import type { Sql } from "@216leads/db";

export interface SourceDef {
  code: string;
  name: string;
  url: string;
  schedule_cron: string;
  notes?: string;
}

export interface RunCtx {
  id: number;
  sql: Sql;
  rowsIn: number;
  rowsUpserted: number;
  rowsUnmatched: number;
  meta: Record<string, unknown>;
  cursor: Record<string, unknown>;
  status: "ok" | "partial";
  log: (msg: string) => void;
}

export async function ensureSource(sql: Sql, s: SourceDef): Promise<Record<string, unknown>> {
  const [row] = await sql<{ cursor: Record<string, unknown> }[]>`
    insert into source (code, name, url, schedule_cron, notes)
    values (${s.code}, ${s.name}, ${s.url}, ${s.schedule_cron}, ${s.notes ?? null})
    on conflict (code) do update set name = excluded.name, url = excluded.url, schedule_cron = excluded.schedule_cron
    returning cursor`;
  return row?.cursor ?? {};
}

export async function setSourceNotes(sql: Sql, code: string, notes: string) {
  await sql`update source set notes = ${notes} where code = ${code}`;
}

export async function withJobRun(
  sql: Sql,
  opts: { job: string; source?: SourceDef; quiet?: boolean },
  fn: (ctx: RunCtx) => Promise<void>,
): Promise<RunCtx> {
  const cursor = opts.source ? await ensureSource(sql, opts.source) : {};
  const [run] = await sql<{ id: number }[]>`
    insert into job_run (source_code, job) values (${opts.source?.code ?? null}, ${opts.job}) returning id`;
  const label = opts.source ? `${opts.job}:${opts.source.code}` : opts.job;
  const started = Date.now();
  const ctx: RunCtx = {
    id: run!.id,
    sql,
    rowsIn: 0,
    rowsUpserted: 0,
    rowsUnmatched: 0,
    meta: {},
    cursor: { ...cursor },
    status: "ok",
    log: (m) => {
      if (!opts.quiet) console.log(`[${label}] ${m}`);
    },
  };
  try {
    await fn(ctx);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    ctx.meta.seconds = Number(secs);
    await sql`
      update job_run set finished_at = now(), status = ${ctx.status}, rows_in = ${ctx.rowsIn},
        rows_upserted = ${ctx.rowsUpserted}, rows_unmatched = ${ctx.rowsUnmatched}, meta = ${sql.json(ctx.meta as never)}
      where id = ${ctx.id}`;
    if (opts.source) {
      await sql`update source set last_success_at = now(), cursor = ${sql.json(ctx.cursor as never)} where code = ${opts.source.code}`;
    }
    ctx.log(`${ctx.status}: in ${ctx.rowsIn}, upserted ${ctx.rowsUpserted}, unmatched ${ctx.rowsUnmatched} (${secs}s)`);
    return ctx;
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}`.slice(0, 4000) : String(e);
    await sql`
      update job_run set finished_at = now(), status = 'error', error = ${msg}, rows_in = ${ctx.rowsIn},
        rows_upserted = ${ctx.rowsUpserted}, rows_unmatched = ${ctx.rowsUnmatched}, meta = ${sql.json(ctx.meta as never)}
      where id = ${ctx.id}`;
    ctx.log(`error: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
