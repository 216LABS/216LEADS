// `ingest_watchdog` job (D3): email ops when a daily ingest has not succeeded in 36 hours.
// Runs from cron after the morning pipeline; sends at most one alert per day.
import type { Sql } from "@216leads/db";
import { ingestHealth, STALE_AFTER_HOURS } from "./health";
import { sendOpsEmail } from "./notify";
import { withJobRun } from "./runtime";

export async function runIngestWatchdog(sql: Sql) {
  return withJobRun(sql, { job: "ingest_watchdog" }, async (ctx) => {
    const h = await ingestHealth(sql);
    ctx.meta.health = h;
    if (h.ok) {
      ctx.log("all daily sources fresh");
      return;
    }
    const [sent] = await sql<{ n: number }[]>`
      select count(*)::int as n from job_run
      where job = 'ingest_watchdog' and (meta->>'alerted')::boolean and started_at > now() - interval '20 hours'`;
    if ((sent?.n ?? 0) > 0) {
      ctx.log("stale, alert already sent today");
      return;
    }
    const lines = h.stale_sources.map((s) => `- ${s.source}: last success ${s.last_success_at ?? "never"}`);
    const r = await sendOpsEmail({
      subject: `216 HomeSignal: ingest has not succeeded in ${STALE_AFTER_HOURS} hours`,
      text: [`These daily sources have no successful run in the last ${STALE_AFTER_HOURS} hours:`, ...lines, "",
        "Check /admin/jobs for errors, then rerun with `pnpm ingest run <source>`."].join("\n"),
    });
    ctx.meta.alerted = true;
    ctx.meta.alert = r;
    ctx.status = "partial";
    ctx.log(`stale: alert sent via ${r.via}`);
  });
}
