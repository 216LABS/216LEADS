// Writes parcel_event rows from any source: contractor resolution, matching,
// idempotent upsert (only changed rows count), unmatched bookkeeping.
import type { Sql } from "@216leads/db";
import { contractorNameNorm } from "@216leads/shared";
import { matchBatch, type MatchInput } from "./match";

export type EventKind =
  | "sale" | "permit" | "violation" | "rental_registration" | "condemnation"
  | "certificate_of_occupancy" | "demolition" | "boardup" | "lead_safe" | "disclosure";

export interface ContractorInput {
  name: string;
  is_individual: boolean;
  license_id?: string | null;
  phone?: string | null;
}

export interface EventInput {
  source: string;
  source_record_id: string;
  kind: EventKind;
  event_date: string;
  category?: string | null;
  raw_type?: string | null;
  description?: string | null;
  amount?: number | null;
  status?: string | null;
  is_active?: boolean | null;
  arms_length?: boolean | null;
  source_url?: string | null;
  lon?: number | null;
  lat?: number | null;
  raw_ref?: string | null;
  contractor?: ContractorInput | null;
  /** When set, the event is attached to this parcel without matching. */
  parcel_key?: string | null;
  match?: MatchInput;
  /** Kept for unmatched_record retries. Owner fields must already be removed. */
  payload?: Record<string, unknown>;
}

export interface WriteResult {
  upserted: number;
  unmatched: number;
  matched: number;
}

export async function resolveContractors(sql: Sql, inputs: (ContractorInput | null | undefined)[]): Promise<(number | null)[]> {
  const uniq = new Map<string, ContractorInput>();
  for (const c of inputs) {
    if (!c?.name?.trim()) continue;
    const norm = contractorNameNorm(c.name);
    if (!norm) continue;
    const prev = uniq.get(norm);
    // A business-name sighting wins over an individual-name sighting.
    if (!prev || (prev.is_individual && !c.is_individual)) uniq.set(norm, c);
  }
  const ids = new Map<string, number>();
  if (uniq.size) {
    const rows = [...uniq.entries()].map(([name_norm, c]) => ({
      name_norm,
      display_name: c.name.trim().replace(/\s+/g, " "),
      license_id: c.license_id ?? null,
      phone: c.phone ?? null,
      is_individual: c.is_individual,
    }));
    const res = await sql<{ id: number; name_norm: string }[]>`
      insert into contractor (name_norm, display_name, license_id, phone, is_individual)
      select name_norm, display_name, license_id, phone, is_individual
      from jsonb_to_recordset(${sql.json(rows as never)}) as x(name_norm text, display_name text, license_id text, phone text, is_individual boolean)
      on conflict (name_norm) do update set
        license_id = coalesce(contractor.license_id, excluded.license_id),
        phone = coalesce(contractor.phone, excluded.phone),
        is_individual = contractor.is_individual and excluded.is_individual
      returning id, name_norm`;
    for (const r of res) ids.set(r.name_norm, r.id);
  }
  return inputs.map((c) => (c?.name?.trim() ? ids.get(contractorNameNorm(c.name)) ?? null : null));
}

export async function writeEvents(sql: Sql, events: EventInput[]): Promise<WriteResult> {
  if (!events.length) return { upserted: 0, unmatched: 0, matched: 0 };
  const contractorIds = await resolveContractors(sql, events.map((e) => e.contractor));

  const needMatch = events.map((e, i) => ({ e, i })).filter(({ e }) => !e.parcel_key && e.match);
  const matches = await matchBatch(sql, needMatch.map(({ e }) => e.match!));
  const matchByIdx = new Map(needMatch.map(({ i }, j) => [i, matches[j] ?? null]));

  const rows = events.map((e, i) => {
    const m = matchByIdx.get(i);
    const validPt = e.lon != null && e.lat != null && Math.abs(e.lon) <= 180 && Math.abs(e.lat) <= 90 && e.lon !== 0;
    return {
      parcel_key: e.parcel_key ?? m?.parcel_key ?? null,
      kind: e.kind,
      source: e.source,
      source_record_id: e.source_record_id,
      event_date: e.event_date,
      category: e.category ?? null,
      raw_type: e.raw_type ?? null,
      description: e.description ? e.description.slice(0, 2000) : null,
      amount: e.amount ?? null,
      contractor_id: contractorIds[i] ?? null,
      status: e.status ?? null,
      is_active: e.is_active ?? null,
      arms_length: e.arms_length ?? null,
      source_url: e.source_url ?? null,
      lon: validPt ? e.lon : null,
      lat: validPt ? e.lat : null,
      match_method: e.parcel_key ? "parcel_id" : m?.method ?? null,
      match_confidence: e.parcel_key ? 1 : m?.confidence ?? null,
      raw_ref: e.raw_ref ?? null,
    };
  });

  // Dedupe within the batch on the conflict key (sources sometimes repeat a record on a page).
  const seen = new Map<string, (typeof rows)[number]>();
  for (const r of rows) seen.set(`${r.source}|${r.source_record_id}`, r);
  const deduped = [...seen.values()];

  const changed = await sql<{ id: number }[]>`
    insert into parcel_event (parcel_key, kind, source, source_record_id, event_date, category, raw_type, description,
      amount, contractor_id, status, is_active, arms_length, source_url, geom, match_method, match_confidence, raw_ref)
    select parcel_key, kind::event_kind, source, source_record_id, event_date, category, raw_type, description,
      amount, contractor_id, status, is_active, arms_length, source_url,
      case when lon is not null then st_setsrid(st_makepoint(lon, lat), 4326) end,
      match_method, match_confidence, raw_ref
    from jsonb_to_recordset(${sql.json(deduped as never)}) as x(
      parcel_key text, kind text, source text, source_record_id text, event_date date, category text, raw_type text,
      description text, amount int, contractor_id bigint, status text, is_active boolean, arms_length boolean,
      source_url text, lon float8, lat float8, match_method text, match_confidence numeric, raw_ref text)
    on conflict (source, source_record_id) do update set
      parcel_key = coalesce(excluded.parcel_key, parcel_event.parcel_key),
      match_method = case when excluded.parcel_key is not null then excluded.match_method else parcel_event.match_method end,
      match_confidence = case when excluded.parcel_key is not null then excluded.match_confidence else parcel_event.match_confidence end,
      event_date = excluded.event_date, category = excluded.category, raw_type = excluded.raw_type,
      description = excluded.description, amount = excluded.amount, contractor_id = excluded.contractor_id,
      status = excluded.status, is_active = excluded.is_active, arms_length = excluded.arms_length,
      source_url = excluded.source_url, geom = coalesce(excluded.geom, parcel_event.geom), raw_ref = excluded.raw_ref
    where (coalesce(excluded.parcel_key, parcel_event.parcel_key), excluded.event_date, excluded.category, excluded.raw_type,
           excluded.description, excluded.amount, excluded.contractor_id, excluded.status, excluded.is_active,
           excluded.arms_length, excluded.source_url)
      is distinct from
          (parcel_event.parcel_key, parcel_event.event_date, parcel_event.category, parcel_event.raw_type,
           parcel_event.description, parcel_event.amount, parcel_event.contractor_id, parcel_event.status,
           parcel_event.is_active, parcel_event.arms_length, parcel_event.source_url)
    returning id`;

  // Unmatched bookkeeping.
  const unmatched = events
    .map((e, i) => ({ e, row: rows[i]! }))
    .filter(({ row, e }) => !row.parcel_key && e.match)
    .map(({ e }) => ({
      source: e.source,
      source_record_id: e.source_record_id,
      addr_raw: e.match?.addrLine ?? null,
      city_raw: null as string | null,
      zip_raw: e.match?.zip != null ? String(e.match.zip) : null,
      parcel_raw: e.match?.parcelId ?? null,
      payload: { ...(e.payload ?? {}), _match: e.match },
    }));
  const uniqUnmatched = [...new Map(unmatched.map((u) => [`${u.source}|${u.source_record_id}`, u])).values()];
  if (uniqUnmatched.length) {
    await sql`
      insert into unmatched_record (source, source_record_id, addr_raw, city_raw, zip_raw, parcel_raw, payload)
      select source, source_record_id, addr_raw, city_raw, zip_raw, parcel_raw, payload
      from jsonb_to_recordset(${sql.json(uniqUnmatched as never)}) as x(source text, source_record_id text, addr_raw text,
        city_raw text, zip_raw text, parcel_raw text, payload jsonb)
      on conflict (source, source_record_id) do nothing`;
  }
  const matchedKeys = rows.filter((r) => r.parcel_key).map((r) => `${r.source}|${r.source_record_id}`);
  if (matchedKeys.length) {
    await sql`delete from unmatched_record where (source || '|' || source_record_id) = any(${matchedKeys})`;
  }
  return { upserted: changed.length, unmatched: uniqUnmatched.length, matched: rows.length - uniqUnmatched.length };
}
