import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDirectSql, closeAll } from "./client";
import { repoRoot } from "./env";

/** Apply SQL files in packages/db/migrations in name order, once each. */
export async function migrate(log: (m: string) => void = console.log): Promise<number> {
  const sql = getDirectSql();
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name));
  const dir = join(repoRoot(), "packages", "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const body = readFileSync(join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${f})`;
    });
    log(`applied ${f}`);
    applied++;
  }
  if (applied === 0) log("migrations up to date");
  return applied;
}

const isMain = process.argv[1] && /migrate\.ts$/.test(process.argv[1]);
if (isMain) {
  migrate()
    .then(() => closeAll())
    .catch(async (e) => {
      console.error(e);
      await closeAll();
      process.exit(1);
    });
}
