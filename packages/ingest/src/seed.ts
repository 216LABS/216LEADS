// Fixtures and seed (spec 15). Fixtures are real records pulled from the live public
// endpoints and saved *after* transformation, so owner fields and mailing addresses never
// reach disk. Seed loads them, then creates the "Demo Roofing" org.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import { optionalEnv, repoRoot, type Sql } from "@216leads/db";
import { municipalityFromTaxDistrict, todayEt } from "@216leads/shared";
import { getTemplate } from "@216leads/scoring";
import { arcgisPages, num, str } from "./arcgis";
import {
  CCPC_CANOPY_LAYER, CUY_PARCEL_POLY_LAYER, CUY_PARCELS_LAYER, RESIDENTIAL_LUC, parcelFromCuyahoga, ringCentroid, saleEventFromParcel,
} from "./sources/cuyahoga";
import { CLE_BASE, cleLayer, eventFromCle, markClevelandCoverage } from "./sources/cleveland";
import { upsertParcels, municipalityIds, type ParcelRow } from "./parcels";
import { writeEvents, type EventInput } from "./events";
import { runSignals } from "./signals";
import { scoreOrg } from "./score";

const FIXTURE_DIR = () => join(repoRoot(), "packages", "ingest", "fixtures");
export const FIXTURE_ZIPS = ["44107", "44111"];
const PER_ZIP = 1000;

type FixtureParcel = ParcelRow & {
  muni_name: string;
  canopy_pct?: number | null;
  grass_pct?: number | null;
  impervious_pct?: number | null;
  survey_2022?: Record<string, string | null> | null;
};

function writeGz(name: string, data: unknown) {
  mkdirSync(FIXTURE_DIR(), { recursive: true });
  writeFileSync(join(FIXTURE_DIR(), name), gzipSync(JSON.stringify(data)));
}

function readGz<T>(name: string): T {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR(), name))).toString("utf8")) as T;
}

const inList = (field: string, ids: string[]) => `${field} IN (${ids.map((x) => `'${x}'`).join(",")})`;

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function pullFixtures(_sql: Sql) {
  const parcels: FixtureParcel[] = [];
  const fields = [
    "parcel_id", "parcel_addr", "parcel_predir", "parcel_street", "parcel_suffix", "parcel_unit", "parcel_city", "parcel_zip",
    "par_addr_all", "tax_dist_desc", "mail_addr_street", "mail_city", "mail_zip", "last_transfer_date", "last_sales_amount",
    "tax_luc", "tax_luc_description", "max_age", "total_res_liv_area", "total_res_rooms", "res_styles", "parcel_acreage",
    "parcel_lot_size", "garage_type", "gas", "water", "sewer", "tax_market_total", "tax_assessed_total", "foreclosure_flag",
    "total_net_delq_balance", "update_date", "condo_complex_id",
  ];
  for (const zip of FIXTURE_ZIPS) {
    const where = `parcel_zip = '${zip}' AND tax_luc IN (${RESIDENTIAL_LUC.map((l) => `'${l}'`).join(",")})`;
    for await (const page of arcgisPages(CUY_PARCELS_LAYER, { where, outFields: fields, pageSize: PER_ZIP, orderBy: "parcel_id" })) {
      for (const f of page.features) {
        const p = parcelFromCuyahoga(f.attributes, null);
        if (p) parcels.push({ ...p, muni_name: municipalityFromTaxDistrict(str(f.attributes.tax_dist_desc), str(f.attributes.parcel_city)) });
      }
      break; // first page only: a contiguous block of parcel numbers (nearby streets)
    }
    console.log(`fixtures: ${zip} parcels loaded`);
  }
  const byId = new Map(parcels.map((p) => [p.parcel_id, p]));
  const ids = [...byId.keys()];

  for (const c of chunks(ids, 300)) {
    for await (const page of arcgisPages(CUY_PARCEL_POLY_LAYER, {
      where: inList("PARCELPIN", c), outFields: ["PARCELPIN"], returnGeometry: true, pageSize: 1000,
      extra: { geometryPrecision: "6" },
    })) {
      for (const f of page.features) {
        const p = byId.get(String(f.attributes.PARCELPIN ?? f.attributes.parcelpin));
        const c = f.geometry?.rings ? ringCentroid(f.geometry.rings) : null;
        if (p && c) {
          p.lon = Math.round(c[0] * 1e6) / 1e6;
          p.lat = Math.round(c[1] * 1e6) / 1e6;
        }
      }
    }
  }
  console.log("fixtures: centroids");

  for (const c of chunks(ids, 300)) {
    for await (const page of arcgisPages(CCPC_CANOPY_LAYER, { where: inList("PARCELPIN", c), outFields: ["PARCELPIN", "Can_P", "Grass_P", "Imperv_P"], pageSize: 2000 })) {
      for (const f of page.features) {
        const p = byId.get(String(f.attributes.PARCELPIN));
        if (!p) continue;
        p.canopy_pct = num(f.attributes.Can_P);
        p.grass_pct = num(f.attributes.Grass_P);
        p.impervious_pct = num(f.attributes.Imperv_P);
      }
    }
  }
  console.log("fixtures: canopy");

  const cleIds = parcels.filter((p) => p.muni_name === "CLEVELAND").map((p) => p.parcel_id);
  const surveyFields: Record<string, string> = {
    roof: "survey_condition_roof", gutters: "survey_condition_gutters", siding: "survey_condition_siding",
    windows: "survey_condition_windows", porch: "survey_condition_porch", chimney: "survey_condition_chimney",
    driveway: "survey_condition_driveway", garage: "survey_condition_garage", paint_peeling: "survey_paintpeeling", grade: "survey_grade",
  };
  for (const c of chunks(cleIds, 300)) {
    for await (const page of arcgisPages(`${CLE_BASE}/Citywide_Property_Survey_2022/FeatureServer/0`, {
      where: inList("parcelnumb_no_formatting", c), outFields: ["parcelnumb_no_formatting", "survey_created", ...Object.values(surveyFields)], pageSize: 2000,
    })) {
      for (const f of page.features) {
        const p = byId.get(String(f.attributes.parcelnumb_no_formatting));
        if (!p) continue;
        const s: Record<string, string | null> = {};
        for (const [k, fld] of Object.entries(surveyFields)) s[k] = str(f.attributes[fld]);
        s.surveyed = str(f.attributes.survey_created);
        p.survey_2022 = s;
      }
    }
  }
  console.log("fixtures: 2022 survey");

  const events: EventInput[] = [];
  const caps: Record<string, number> = { cle_permits: 500, cle_violations: 100, cle_rentals: 150, cle_condemnations: 20 };
  for (const [code, cap] of Object.entries(caps)) {
    const l = cleLayer(code);
    const got: EventInput[] = [];
    for (const c of chunks(cleIds, 300)) {
      for await (const page of arcgisPages(`${CLE_BASE}/${l.service}/FeatureServer/0`, { where: inList(l.keyField, c), outFields: l.outFields, pageSize: 1000 })) {
        for (const f of page.features) {
          const e = eventFromCle(l, f.attributes, l.dateField!);
          if (e) got.push({ ...e, payload: undefined });
        }
      }
    }
    got.sort((a, b) => (a.event_date < b.event_date ? 1 : -1));
    events.push(...got.slice(0, cap));
    console.log(`fixtures: ${code} ${Math.min(cap, got.length)} of ${got.length}`);
  }

  writeGz("parcels.json.gz", parcels);
  writeGz("events.json.gz", events);
  writeFileSync(join(FIXTURE_DIR(), "meta.json"), JSON.stringify({
    pulled_on: todayEt(),
    zips: FIXTURE_ZIPS,
    parcels: parcels.length,
    events: Object.fromEntries(Object.keys(caps).map((c) => [c, events.filter((e) => e.source === c).length])),
    sales: parcels.filter((p) => p.last_sale_date).length,
    note: "Real public records from Cuyahoga County and City of Cleveland ArcGIS services. Owner names and mailing addresses are never included.",
  }, null, 2));
  console.log(`fixtures written to ${FIXTURE_DIR()}`);
}

export async function loadFixtures(sql: Sql) {
  const parcels = readGz<FixtureParcel[]>("parcels.json.gz");
  const events = readGz<EventInput[]>("events.json.gz");
  const muni = await municipalityIds(sql, "cuyahoga", parcels.map((p) => p.muni_name));
  for (const p of parcels) p.municipality_id = muni.get(p.muni_name) ?? null;
  for (let i = 0; i < parcels.length; i += 1000) await upsertParcels(sql, parcels.slice(i, i + 1000), { withGeom: true });
  const extra = parcels.map((p) => ({
    parcel_key: p.parcel_key, canopy: p.canopy_pct ?? null, grass: p.grass_pct ?? null, imperv: p.impervious_pct ?? null, survey: p.survey_2022 ?? null,
  }));
  await sql`
    update parcel p set canopy_pct = x.canopy, grass_pct = x.grass, impervious_pct = x.imperv, survey_2022 = x.survey
    from jsonb_to_recordset(${sql.json(extra as never)}) as x(parcel_key text, canopy numeric, grass numeric, imperv numeric, survey jsonb)
    where p.parcel_key = x.parcel_key`;
  const sales = parcels.map(saleEventFromParcel).filter((e): e is EventInput => e !== null);
  await writeEvents(sql, sales);
  for (let i = 0; i < events.length; i += 500) await writeEvents(sql, events.slice(i, i + 500));
  for (const code of ["cle_permits", "cle_violations", "cle_rentals"]) await markClevelandCoverage(sql, code);
  console.log(`seed: ${parcels.length} homes, ${sales.length} sales, ${events.length} Cleveland records`);
}

// ---------------------------------------------------------------------------
// Demo org + local demo login

export const DEMO = { email: "demo@216leads.test", password: "demo-roofing-216", org: "Demo Roofing", zips: FIXTURE_ZIPS };

async function ensureAuthUser(sql: Sql, email: string, password: string): Promise<string | null> {
  const [found] = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`;
  if (found) return found.id;
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.log("seed: Supabase URL/service key not set; skipping demo login");
    return null;
  }
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    console.log(`seed: could not create demo login (${res.status}): ${await res.text()}`);
    return null;
  }
  return ((await res.json()) as { id: string }).id;
}

export async function ensureDemoOrg(sql: Sql): Promise<string | null> {
  const userId = await ensureAuthUser(sql, DEMO.email, DEMO.password);
  const [existing] = await sql<{ id: string }[]>`select id from org where name = ${DEMO.org} order by created_at limit 1`;
  let orgId = existing?.id;
  if (!orgId) {
    const t = getTemplate("roofing");
    const [o] = await sql<{ id: string }[]>`
      insert into org (name, trade, plan, trial_ends_at, onboarded_at, phone, website, default_offer, digest_emails, coach_marks_seen)
      values (${DEMO.org}, 'roofing', 'trial', now() + interval '14 days', now(), '(216) 555-0142', 'https://example.com',
        '$150 off a full roof replacement', ${[DEMO.email]}, false)
      returning id`;
    orgId = o!.id;
    for (const z of DEMO.zips) await sql`insert into territory (org_id, kind, zip) values (${orgId}, 'zip', ${z})`;
    await sql`insert into scoring_profile (org_id, template_key, template_version) values (${orgId}, ${t.key}, ${t.version})`;
  }
  if (userId) {
    await sql`insert into org_member (org_id, user_id, role) values (${orgId}, ${userId}, 'owner') on conflict do nothing`;
  }
  return orgId;
}

export async function seed(sql: Sql, o: { force?: boolean } = {}) {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from parcel`;
  const n = row?.n ?? 0;
  if (n > 0 && !o.force) {
    console.log(`seed: ${n.toLocaleString()} homes already loaded; skipping fixtures (use --force to reload)`);
  } else {
    if (!existsSync(join(FIXTURE_DIR(), "parcels.json.gz"))) throw new Error("fixtures missing: run `pnpm fixtures:pull`");
    await loadFixtures(sql);
    await runSignals(sql);
  }
  const orgId = await ensureDemoOrg(sql);
  if (orgId) {
    const s = await scoreOrg(sql, orgId);
    console.log(`seed: Demo Roofing has ${s.qualified} scored leads. Local demo login: ${DEMO.email} / ${DEMO.password}`);
  }
}
