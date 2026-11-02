// Dev tool: show which sampled person owner names appear in the raw page store, and which
// JSON field holds them. Prints field names and counts only; nothing is stored.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { closeAll, getDirectSql, repoRoot } from "@216leads/db";
import { looksLikeIndividual } from "@216leads/shared";
import { sampleOwnerNamesForDebug } from "../privacy";

const sql = getDirectSql();
const names = [...(await sampleOwnerNamesForDebug(sql, 400))].filter((n) =>
  looksLikeIndividual(n.replace(/[,&]/g, " ").replace(/\s+/g, " ").split(" ").slice(0, 4).join(" ")));

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".json.gz")) yield p;
  }
}

for (const f of walk(join(repoRoot(), ".data", "raw"))) {
  const rows = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as Record<string, unknown>[];
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "string" && names.some((n) => v.toUpperCase().includes(n))) {
        console.log(f.split(".data")[1], "field:", k, "| record kind:", Object.keys(r).slice(0, 3).join(","));
      }
    }
  }
}
await closeAll();
