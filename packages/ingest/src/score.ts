// `score` job and live preview: load homes + signals for a scope, score in memory with the
// pure engine, and (for orgs) diff-upsert leads (spec 7.1, 7.7).
import type { Sql } from "@216leads/db";
import {
  effectiveProfile, getTemplate, hasTemplate, parseRecipe, passesFilters, percentileRanks, scoreParcel,
  type MaterializedSignal, type ParcelFacts, type Profile, type RecentEvent, type ScoreInput, type ScoreResult, type Template,
} from "@216leads/scoring";
import { todayEt } from "@216leads/shared";
import { canopyUrl, floodUrl, parcelRecordUrl, surveyUrl } from "./urls";
import { activeRecipe } from "./recipes";
import { withJobRun } from "./runtime";

export interface LoadedHome {
  input: ScoreInput;
  addr_norm: string;
  municipality: string | null;
  lon: number | null;
  lat: number | null;
}

type Scope = { orgId: string } | { zips: string[] };

interface ParcelRowDb extends ParcelFacts {
  county_code: string;
  parcel_id: string;
  addr_norm: string;
  lon: number | null;
  lat: number | null;
  muni: string | null;
  cov_permits: boolean;
  permits_since: number | null;
  cov_viol: boolean;
}

/**
 * The scope as a parcel filter. An org's territories are read once and turned into plain
 * zip / municipality conditions so each query below uses the parcel indexes (spec 7.7).
 */
async function scopeWhere(sql: Sql, scope: Scope) {
  if (!("orgId" in scope)) return () => sql`p.zip = any(${scope.zips})`;
  const ts = await sql<{ kind: string; zip: string | null; municipality_id: number | null }[]>`
    select kind, zip, municipality_id from territory where org_id = ${scope.orgId}`;
  const zips = ts.filter((t) => t.kind === "zip" && t.zip).map((t) => t.zip!);
  const munis = ts.filter((t) => t.kind === "municipality" && t.municipality_id !== null).map((t) => t.municipality_id!);
  const polygons = ts.some((t) => t.kind === "polygon");
  return () => sql`(p.zip = any(${zips}) or p.municipality_id = any(${munis}::int[])${
    polygons ? sql` or exists (select 1 from territory t where t.org_id = ${scope.orgId} and t.kind = 'polygon' and st_contains(t.geom, p.geom))` : sql``
  })`;
}

/** Load everything scoring needs for the residential homes in a scope. */
export async function loadHomes(sql: Sql, scope: Scope, today = todayEt()): Promise<LoadedHome[]> {
  const where = await scopeWhere(sql, scope);
  const parcels = await sql<ParcelRowDb[]>`
    select p.parcel_key, p.county_code, p.parcel_id, p.addr_line, p.city, p.zip, p.addr_norm, p.land_use_code, p.year_built,
      p.living_sqft, p.lot_acres, p.style, p.garage_type, p.gas_service, p.water_source, p.sewer_type, p.market_value,
      p.last_sale_date::text as last_sale_date, p.last_sale_price, p.owner_occupied_guess, p.is_rental, p.is_condo,
      p.tax_delinquent, p.canopy_pct, p.grass_pct, p.flood_zone, p.in_sfha, p.survey_2022, p.data_limited,
      st_x(p.geom) as lon, st_y(p.geom) as lat, m.name as muni,
      (m.permits_source is not null) as cov_permits, m.permits_since, coalesce(m.has_violations, false) as cov_viol
    from parcel p left join municipality m on m.id = p.municipality_id
    where is_residential(p.land_use_code, p.data_limited) and ${where()}`;
  if (!parcels.length) return [];

  const signals = await sql<{ parcel_key: string; key: string; value: number; evidence: MaterializedSignal["evidence"] }[]>`
    select s.parcel_key, s.key, s.value, s.evidence
    from parcel_signal s join parcel p on p.parcel_key = s.parcel_key
    where is_residential(p.land_use_code, p.data_limited) and ${where()}`;
  const events = await sql<(RecentEvent & { parcel_key: string })[]>`
    select e.id, e.parcel_key, e.kind::text as kind, e.category, e.event_date::text as event_date, e.source_url,
      e.amount, e.arms_length, e.is_active
    from parcel_event e join parcel p on p.parcel_key = e.parcel_key
    where e.event_date >= ${today}::date - 120 and e.kind in ('sale', 'violation', 'permit')
      and is_residential(p.land_use_code, p.data_limited) and ${where()}`;

  const priors: Record<string, number> = {};
  for (const r of await sql<{ key: string; value: number }[]>`select key, value from signal_prior`) priors[r.key] = Number(r.value);

  const sigBy = new Map<string, Record<string, MaterializedSignal>>();
  for (const s of signals) {
    let m = sigBy.get(s.parcel_key);
    if (!m) sigBy.set(s.parcel_key, (m = {}));
    m[s.key] = { value: Number(s.value), evidence: s.evidence ?? {} };
  }
  const evBy = new Map<string, RecentEvent[]>();
  for (const e of events) {
    const list = evBy.get(e.parcel_key) ?? [];
    list.push(e);
    evBy.set(e.parcel_key, list);
  }

  const lotPct = percentileRanks(parcels.map((p) => p.lot_acres));
  const livPct = percentileRanks(parcels.map((p) => p.living_sqft));

  return parcels.map((p, i) => {
    const sig = sigBy.get(p.parcel_key) ?? {};
    const facts: ParcelFacts = {
      parcel_key: p.parcel_key, addr_line: p.addr_line, city: p.city, zip: p.zip, land_use_code: p.land_use_code,
      year_built: p.year_built, living_sqft: p.living_sqft, lot_acres: p.lot_acres === null ? null : Number(p.lot_acres),
      style: p.style, garage_type: p.garage_type, gas_service: p.gas_service, water_source: p.water_source,
      sewer_type: p.sewer_type, market_value: p.market_value, last_sale_date: p.last_sale_date, last_sale_price: p.last_sale_price,
      owner_occupied_guess: p.owner_occupied_guess, is_rental: p.is_rental, is_condo: p.is_condo, tax_delinquent: p.tax_delinquent,
      canopy_pct: p.canopy_pct === null ? null : Number(p.canopy_pct), grass_pct: p.grass_pct === null ? null : Number(p.grass_pct),
      flood_zone: p.flood_zone, in_sfha: p.in_sfha, survey_2022: p.survey_2022, data_limited: p.data_limited,
    };
    const input: ScoreInput = {
      parcel: facts,
      signals: sig,
      coverage: { permits: p.cov_permits, permits_since: p.permits_since ?? undefined, violations: p.cov_viol },
      derived: { lot_pct: lotPct[i], living_pct: livPct[i] },
      recentEvents: evBy.get(p.parcel_key) ?? [],
      flags: { condemned: !!sig["excl:condemned"], demolished: !!sig["excl:demolished"], boarded: !!sig["excl:boarded"] },
      parcelRecordUrl: parcelRecordUrl(p.county_code, p.parcel_id),
      urls: {
        survey: p.survey_2022 ? surveyUrl(p.county_code, p.parcel_id) : null,
        canopy: canopyUrl(p.county_code, p.parcel_id),
        flood: floodUrl(p.lon, p.lat),
      },
      priors,
      municipality: p.muni,
      today,
    };
    return { input, addr_norm: p.addr_norm, municipality: p.muni, lon: p.lon, lat: p.lat };
  });
}

export interface Scored {
  home: LoadedHome;
  result: ScoreResult;
}

export interface ScoreSummary {
  considered: number;
  filtered: Record<string, number>;
  qualified: Scored[];
}

/** Score loaded homes for one template + profile. Suppressed homes are removed first. */
export function scoreHomes(
  t: Template,
  profile: Profile,
  homes: LoadedHome[],
  suppressed: { keys: Set<string>; norms: Set<string> } = { keys: new Set(), norms: new Set() },
): ScoreSummary {
  const filtered: Record<string, number> = {};
  const qualified: Scored[] = [];
  for (const home of homes) {
    const k = home.input.parcel.parcel_key;
    if (suppressed.keys.has(k) || suppressed.norms.has(home.addr_norm)) {
      filtered.suppressed = (filtered.suppressed ?? 0) + 1;
      continue;
    }
    const f = passesFilters(home.input, profile);
    if (!f.ok) {
      filtered[f.reason] = (filtered[f.reason] ?? 0) + 1;
      continue;
    }
    const result = scoreParcel(t, profile, home.input);
    if (result.qualifies) qualified.push({ home, result });
  }
  qualified.sort((a, b) => b.result.score - a.result.score || (a.home.input.parcel.parcel_key < b.home.input.parcel.parcel_key ? -1 : 1));
  return { considered: homes.length, filtered, qualified };
}

export async function loadSuppression(sql: Sql, orgId: string | null) {
  const g = await sql<{ addr_norm: string; parcel_key: string | null }[]>`select addr_norm, parcel_key from suppression`;
  const o = orgId
    ? await sql<{ addr_norm: string; parcel_key: string | null }[]>`select addr_norm, parcel_key from org_suppression where org_id = ${orgId}`
    : [];
  const keys = new Set<string>();
  const norms = new Set<string>();
  for (const r of [...g, ...o]) {
    norms.add(r.addr_norm);
    if (r.parcel_key) keys.add(r.parcel_key);
  }
  return { keys, norms };
}

export async function loadOrgProfile(sql: Sql, orgId: string): Promise<{ template: Template; profile: Profile; trade: string }> {
  const [row] = await sql<{ trade: string; template_key: string | null; weights: Profile["weights"] | null; filters: Profile["filters"] | null;
    exclusions: Profile["exclusions"] | null; learned_weights: Profile["learned_weights"] | null }[]>`
    select o.trade, sp.template_key, sp.weights, sp.filters, sp.exclusions, sp.learned_weights
    from org o left join scoring_profile sp on sp.org_id = o.id where o.id = ${orgId}`;
  if (!row) throw new Error(`org ${orgId} not found`);
  // The org's active recipe version wins (Addendum A6); otherwise its trade preset.
  const active = await activeRecipe(sql, orgId);
  const parsed = active ? parseRecipe(active.recipe) : null;
  if (parsed && !parsed.ok) console.error(`org ${orgId}: active recipe ${active!.id} is invalid; using the preset`, parsed.errors);
  const key = row.template_key && hasTemplate(row.template_key) ? row.template_key : row.trade;
  const template = parsed?.ok ? parsed.recipe : getTemplate(hasTemplate(key) ? key : "roofing");
  const profile = effectiveProfile(template, {
    weights: row.weights ?? {}, filters: row.filters ?? {}, exclusions: row.exclusions ?? {}, learned_weights: row.learned_weights ?? {},
  });
  return { template, profile, trade: row.trade };
}

/** Key-order-independent JSON, so jsonb round trips compare equal. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export interface OrgScoreStats {
  homes: number;
  qualified: number;
  inserted: number;
  updated: number;
  removed: number;
  ms: number;
}

/** Score one org and write its leads. Only meaningful changes are written. */
export async function scoreOrg(sql: Sql, orgId: string, today = todayEt()): Promise<OrgScoreStats> {
  const started = Date.now();
  const { template, profile, trade } = await loadOrgProfile(sql, orgId);
  const homes = await loadHomes(sql, { orgId }, today);
  const supp = await loadSuppression(sql, orgId);
  const { qualified } = scoreHomes(template, profile, homes, supp);

  // Exclusivity (spec 13): another org holds this trade+zip -> leads visible 72 hours later.
  const locks = await sql<{ zip: string; org_id: string }[]>`select zip, org_id from exclusivity_lock where trade = ${trade}`;
  const lockedByOther = new Set(locks.filter((l) => l.org_id !== orgId).map((l) => l.zip));

  const existing = await sql<{ id: string; parcel_key: string; score: number; status: string; trigger_label: string | null;
    trigger_date: string | null; touched: boolean; reasons: unknown }[]>`
    select l.id, l.parcel_key, l.score, l.status::text as status, l.trigger_label, l.trigger_date::text as trigger_date, l.reasons,
      (exists (select 1 from lead_note n where n.lead_id = l.id) or exists (select 1 from mail_piece m where m.lead_id = l.id)
        or l.first_touch_at is not null) as touched
    from lead l where l.org_id = ${orgId}`;
  const byKey = new Map(existing.map((e) => [e.parcel_key, e]));

  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const keep = new Set<string>();
  for (const { home, result } of qualified) {
    const k = home.input.parcel.parcel_key;
    keep.add(k);
    const row = {
      parcel_key: k,
      score: result.score,
      reasons: result.reasons,
      pitch: result.pitch,
      trigger_event_id: result.trigger?.event_id ?? null,
      trigger_label: result.trigger?.label ?? null,
      trigger_date: result.trigger?.date ?? null,
      delay: lockedByOther.has(home.input.parcel.zip),
    };
    const prev = byKey.get(k);
    if (!prev) inserts.push(row);
    else {
      const crossed = (prev.score >= template.threshold) !== (result.score >= template.threshold);
      const trigChanged = prev.trigger_label !== row.trigger_label || prev.trigger_date !== row.trigger_date;
      // Spec 7.7 writes on a 3+ point move or a threshold crossing; we also write when the
      // reasons themselves change (new permit, new sale) so "why this home" never goes stale.
      const reasonsChanged = canonical(prev.reasons) !== canonical(row.reasons);
      if (Math.abs(prev.score - result.score) >= 3 || crossed || trigChanged || reasonsChanged) updates.push({ id: prev.id, ...row });
    }
  }
  const removeIds = existing.filter((e) => !keep.has(e.parcel_key) && e.status === "new" && !e.touched).map((e) => e.id);

  await sql.begin(async (tx) => {
    for (let i = 0; i < inserts.length; i += 5000) {
      const chunk = inserts.slice(i, i + 5000);
      await tx`
        insert into lead (org_id, parcel_key, score, reasons, pitch, trigger_event_id, trigger_label, trigger_date, visible_from)
        select ${orgId}, parcel_key, score, reasons, pitch, trigger_event_id, trigger_label, trigger_date,
          case when delay then now() + interval '72 hours' else now() end
        from jsonb_to_recordset(${tx.json(chunk as never)}) as x(parcel_key text, score int, reasons jsonb, pitch text,
          trigger_event_id bigint, trigger_label text, trigger_date date, delay boolean)
        on conflict (org_id, parcel_key) do nothing`;
    }
    for (let i = 0; i < updates.length; i += 5000) {
      const chunk = updates.slice(i, i + 5000);
      await tx`
        update lead l set score = x.score, reasons = x.reasons, pitch = x.pitch, trigger_event_id = x.trigger_event_id,
          trigger_label = x.trigger_label, trigger_date = x.trigger_date, last_scored_at = now()
        from jsonb_to_recordset(${tx.json(chunk as never)}) as x(id uuid, score int, reasons jsonb, pitch text,
          trigger_event_id bigint, trigger_label text, trigger_date date)
        where l.id = x.id and l.org_id = ${orgId}`;
    }
    if (removeIds.length) await tx`delete from lead where org_id = ${orgId} and id = any(${removeIds}::uuid[])`;
  });

  return { homes: homes.length, qualified: qualified.length, inserted: inserts.length, updated: updates.length, removed: removeIds.length, ms: Date.now() - started };
}

export async function runScoreAll(sql: Sql, onlyOrg?: string) {
  return withJobRun(sql, { job: "score" }, async (ctx) => {
    const orgs = onlyOrg
      ? [{ id: onlyOrg }]
      : await sql<{ id: string }[]>`select id from org where plan <> 'canceled' and onboarded_at is not null`;
    const per: Record<string, OrgScoreStats> = {};
    for (const o of orgs) {
      const s = await scoreOrg(sql, o.id);
      per[o.id] = s;
      ctx.rowsIn += s.homes;
      ctx.rowsUpserted += s.inserted + s.updated;
      ctx.log(`org ${o.id.slice(0, 8)}: ${s.homes} homes, ${s.qualified} leads (+${s.inserted} ~${s.updated} -${s.removed}) in ${s.ms}ms`);
    }
    ctx.meta.orgs = per;
  });
}

// ---------------------------------------------------------------------------
// Live preview for onboarding: counts per zip + 5 sample homes. Homes per zip are cached
// in memory for 10 minutes so slider changes only re-run the in-memory scoring.

const zipCache = new Map<string, { at: number; homes: LoadedHome[] }>();
const ZIP_TTL_MS = 10 * 60 * 1000;

async function homesForZips(sql: Sql, zips: string[]): Promise<LoadedHome[]> {
  const now = Date.now();
  const missing = zips.filter((z) => {
    const c = zipCache.get(z);
    return !c || now - c.at > ZIP_TTL_MS;
  });
  if (missing.length) {
    const loaded = await loadHomes(sql, { zips: missing });
    const byZip = new Map<string, LoadedHome[]>(missing.map((z) => [z, []]));
    for (const h of loaded) byZip.get(h.input.parcel.zip)?.push(h);
    for (const [z, homes] of byZip) zipCache.set(z, { at: now, homes });
  }
  const all = zips.flatMap((z) => zipCache.get(z)?.homes ?? []);
  // Percentiles must reflect the whole selected area, not each zip alone.
  const lot = percentileRanks(all.map((h) => h.input.parcel.lot_acres));
  const liv = percentileRanks(all.map((h) => h.input.parcel.living_sqft));
  return all.map((h, i) => ({ ...h, input: { ...h.input, derived: { lot_pct: lot[i], living_pct: liv[i] } } }));
}

export interface PreviewZip {
  zip: string;
  town: string;
  homes: number;
  matching: number;
  new_this_week: number;
}

export interface PreviewHome {
  parcel_key: string;
  addr_line: string;
  city: string;
  zip: string;
  score: number;
  reasons: { label: string }[];
  trigger: { label: string; date: string } | null;
}

export async function previewTerritory(
  sql: Sql,
  args: { trade?: string; template?: Template; zips: string[]; profile?: Partial<Profile>; orgId?: string | null },
): Promise<{ zips: PreviewZip[]; sample: PreviewHome[]; total: number }> {
  // A wizard draft recipe (Addendum A4) or a preset by key.
  const t = args.template ?? getTemplate(args.trade ?? "roofing");
  const profile = effectiveProfile(t, args.profile ?? {});
  const zips = [...new Set(args.zips.map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z)))].slice(0, 25);
  if (!zips.length) return { zips: [], sample: [], total: 0 };
  const homes = await homesForZips(sql, zips);
  const supp = await loadSuppression(sql, args.orgId ?? null);
  const { qualified } = scoreHomes(t, profile, homes, supp);
  const today = todayEt();
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const perZip = new Map<string, PreviewZip>();
  for (const z of zips) perZip.set(z, { zip: z, town: "", homes: 0, matching: 0, new_this_week: 0 });
  const townCount = new Map<string, Map<string, number>>();
  for (const h of homes) {
    const z = perZip.get(h.input.parcel.zip);
    if (!z) continue;
    z.homes++;
    const tc = townCount.get(z.zip) ?? new Map<string, number>();
    tc.set(h.input.parcel.city, (tc.get(h.input.parcel.city) ?? 0) + 1);
    townCount.set(z.zip, tc);
  }
  for (const [zip, tc] of townCount) {
    const top = [...tc.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) perZip.get(zip)!.town = top[0];
  }
  for (const q of qualified) {
    const z = perZip.get(q.home.input.parcel.zip);
    if (!z) continue;
    z.matching++;
    if (q.result.trigger && q.result.trigger.date >= weekAgo) z.new_this_week++;
  }
  const sample = qualified.slice(0, 5).map((q) => ({
    parcel_key: q.home.input.parcel.parcel_key,
    addr_line: q.home.input.parcel.addr_line,
    city: q.home.input.parcel.city,
    zip: q.home.input.parcel.zip,
    score: q.result.score,
    reasons: q.result.reasons.slice(0, 3).map((r) => ({ label: r.label })),
    trigger: q.result.trigger ? { label: q.result.trigger.label, date: q.result.trigger.date } : null,
  }));
  return { zips: [...perZip.values()], sample, total: qualified.length };
}

export function clearPreviewCache() {
  zipCache.clear();
}
