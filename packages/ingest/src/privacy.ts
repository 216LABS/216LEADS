// `privacy_audit` job (spec 14 / M1 acceptance "no owner-name strings in any table").
// Fetches real owner names for a sample of stored homes straight from the public sources,
// keeps them only in memory, then searches every text/jsonb column in the public schema and
// the raw page store for them. Names are never written anywhere; only counts are recorded.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Sql } from "@216leads/db";
import { optionalEnv, repoRoot } from "@216leads/db";
import { arcgisPages, str } from "./arcgis";
import { CUY_PARCELS_LAYER } from "./sources/cuyahoga";
import { CLE_BASE } from "./sources/cleveland";
import { withJobRun } from "./runtime";
import { looksLikeIndividual } from "@216leads/shared";

const MIN_LEN = 8; // skip short strings that collide with ordinary words

export async function sampleOwnerNamesForDebug(sql: Sql, n: number) { return sampleOwnerNames(sql, n); }

async function sampleOwnerNames(sql: Sql, n: number): Promise<Set<string>> {
  const ids = (await sql<{ parcel_id: string }[]>`
    select parcel_id from parcel where county_code = 'cuyahoga' and is_residential(land_use_code, data_limited)
    order by md5(parcel_id) limit ${n}`).map((r) => r.parcel_id);
  const names = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const where = `parcel_id IN (${ids.slice(i, i + 200).map((x) => `'${x}'`).join(",")})`;
    for await (const page of arcgisPages(CUY_PARCELS_LAYER, {
      where, outFields: ["parcel_owner", "second_owner", "mail_name", "grantee"], pageSize: 1000, orderBy: "ObjectID",
    })) {
      for (const f of page.features) {
        for (const k of ["parcel_owner", "second_owner", "mail_name", "grantee"]) {
          const v = str(f.attributes[k]);
          if (v && v.length >= MIN_LEN) names.add(v.toUpperCase());
        }
      }
    }
  }
  // Cleveland rental registry owners for registered homes we hold.
  const rentals = (await sql<{ source_record_id: string }[]>`
    select source_record_id from parcel_event where source = 'cle_rentals' order by md5(source_record_id) limit 200`).map((r) => r.source_record_id);
  if (rentals.length) {
    const where = `Record_ID IN (${rentals.map((x) => `'${x.replace(/'/g, "")}'`).join(",")})`;
    for await (const page of arcgisPages(`${CLE_BASE}/Rental_Registrations/FeatureServer/0`, {
      where, outFields: ["Owner_Name", "Owner_Org_Name"], pageSize: 1000,
    })) {
      for (const f of page.features) {
        for (const k of ["Owner_Name", "Owner_Org_Name"]) {
          const v = str(f.attributes[k]);
          if (v && v.length >= MIN_LEN) names.add(v.toUpperCase());
        }
      }
    }
  }
  return names;
}

function* walk(dir: string): Generator<string> {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".json.gz")) yield p;
  }
}

export interface PrivacyResult {
  /** Owner names that look like a person: these must never appear. */
  names_checked: number;
  /** Owner names that are organizations (LLCs, land banks, nonprofits) are not checked:
   *  permits legitimately name the business a job is for. */
  org_names_skipped: number;
  db_hits: { table: string; column: string; count: number }[];
  raw_files_checked: number;
  raw_hits: number;
}

export async function runPrivacyAudit(sql: Sql, sample = 400): Promise<PrivacyResult> {
  const result: PrivacyResult = { names_checked: 0, org_names_skipped: 0, db_hits: [], raw_files_checked: 0, raw_hits: 0 };
  await withJobRun(sql, { job: "privacy_audit" }, async (ctx) => {
    const all = [...(await sampleOwnerNames(sql, sample))];
    // County owner names are "SMITH, JOHN" / "SMITH JOHN & MARY"; business words mark organizations.
    const names = all.filter((n) => looksLikeIndividual(n.replace(/[,&]/g, " ").replace(/\s+/g, " ").split(" ").slice(0, 4).join(" ")));
    result.names_checked = names.length;
    result.org_names_skipped = all.length - names.length;
    ctx.rowsIn = names.length;

    const cols = await sql<{ table_name: string; column_name: string }[]>`
      select c.table_name, c.column_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and c.data_type in ('text', 'jsonb', 'character varying', 'citext', 'ARRAY')
        and c.table_name not in ('_migrations')`;
    for (const c of cols) {
      const [row] = await sql.unsafe(
        `select count(*)::int as n from "${c.table_name}" where upper("${c.column_name}"::text) like any($1::text[])`,
        [names.map((n) => `%${n.replace(/[%_\\]/g, "")}%`)] as never[],
      );
      const n = Number((row as { n: number } | undefined)?.n ?? 0);
      if (n > 0) result.db_hits.push({ table: c.table_name, column: c.column_name, count: n });
    }

    const base = optionalEnv("INGEST_RAW_BUCKET") ?? ".data/raw";
    const dir = base.startsWith(".") ? join(repoRoot(), base) : base;
    for (const f of walk(dir)) {
      result.raw_files_checked++;
      const text = gunzipSync(readFileSync(f)).toString("utf8").toUpperCase();
      if (names.some((n) => text.includes(n))) result.raw_hits++;
    }
    ctx.meta = { ...result } as unknown as Record<string, unknown>;
    ctx.rowsUnmatched = result.db_hits.reduce((s, h) => s + h.count, 0) + result.raw_hits;
    if (ctx.rowsUnmatched > 0) ctx.status = "partial";
    ctx.log(`checked ${names.length} person owner names (${result.org_names_skipped} org names skipped): ${result.db_hits.length} column hits, ${result.raw_hits}/${result.raw_files_checked} raw files`);
  });
  return result;
}
