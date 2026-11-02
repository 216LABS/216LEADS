// 216 HomeSignal ingest CLI.
//   pnpm ingest run <job> [--full] [--zips 44111,44107] [--city CLEVELAND] [--since 2026-01-01] [--limit N] [--org <uuid>]
//   pnpm ingest pipeline cleveland|daily
//   pnpm ingest jobs
//   pnpm ingest seed [--force]      (local demo)
//   pnpm ingest seed --staging      (QA orgs + QA login; never production)
//   pnpm ingest fixtures pull
import { closeAll, getDirectSql, migrate } from "@216leads/db";
import { CLEVELAND_FULL, COUNTIES_FULL, DAILY, JOBS, runJob, type JobOpts } from "./jobs";
import { pullFixtures, seed, seedStaging } from "./seed";
import { rawStore } from "./rawstore";
import { initSentry, reportError } from "./sentry";

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

function jobOpts(flags: Record<string, string | boolean>): JobOpts {
  const s = (k: string) => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);
  return {
    full: flags.full === true,
    zips: s("zips")?.split(",").map((z) => z.trim()).filter(Boolean),
    city: s("city"),
    since: s("since"),
    limit: s("limit") ? Number(s("limit")) : undefined,
    org: s("org"),
  };
}

async function main() {
  initSentry();
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = pos;
  const sql = getDirectSql();
  switch (cmd) {
    case "jobs":
      for (const [k, v] of Object.entries(JOBS)) console.log(`${k.padEnd(20)} ${v.describe}`);
      break;
    case "run":
      if (!arg) throw new Error("usage: run <job>");
      await runJob(sql, arg, jobOpts(flags));
      break;
    case "pipeline": {
      const list = arg === "daily" ? DAILY : arg === "cleveland" ? CLEVELAND_FULL : arg === "counties" ? COUNTIES_FULL : null;
      if (!list) throw new Error("usage: pipeline cleveland|counties|daily");
      await migrate(() => {});
      const o = jobOpts(flags);
      const failed: string[] = [];
      for (const j of list) {
        // The first Cleveland load is a full one; later daily runs are deltas. One source being
        // down must not stop the rest of the day (matching, scoring), so failures are collected.
        try {
          await runJob(sql, j, { ...o, full: arg === "cleveland" ? true : o.full });
        } catch (e) {
          failed.push(j);
          console.error(`[${j}] failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (arg === "daily") console.log(`purged ${rawStore().purgeOlderThan(180)} raw day folders older than 180 days`);
      if (failed.length) throw new Error(`pipeline ${arg}: ${failed.join(", ")} failed`);
      break;
    }
    case "seed":
      if (flags.staging === true) await seedStaging(sql);
      else await seed(sql, { force: flags.force === true });
      break;
    case "fixtures":
      if (arg !== "pull") throw new Error("usage: fixtures pull");
      await pullFixtures(sql);
      break;
    default:
      console.log("usage: pnpm ingest <jobs|run <job>|pipeline cleveland|daily|seed|fixtures pull>");
  }
}

main()
  .then(() => closeAll())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await reportError(e, { argv: process.argv.slice(2) });
    await closeAll();
    process.exit(1);
  });
