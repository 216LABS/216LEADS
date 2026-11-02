// Admin "free list" (issue #6): a branded sample of top homes for a prospect's trade and ZIPs, from
// current scores. Only public-record facts: address, town, score, top reasons, age, last sale.
// No owner or applicant names exist to include; opted-out homes are never listed.
import { randomBytes } from "node:crypto";
import type { Sql } from "@216leads/db";
import { BRAND, titleCase, todayEt } from "@216leads/shared";
import { effectiveProfile, getTemplate } from "@216leads/scoring";
import { loadHomes, loadSuppression, scoreHomes } from "./score";

export const PROSPECT_LIST_DAYS = 14;
export const PER_ZIP_MAX = 50;

export interface ProspectRow {
  address: string;
  town: string;
  zip: string;
  score: number;
  reasons: string[];
  year_built: number | null;
  last_sale_date: string | null;
  lon: number | null;
  lat: number | null;
}

export async function buildProspectRows(sql: Sql, o: { trade: string; zips: string[]; perZip: number }): Promise<ProspectRow[]> {
  const t = getTemplate(o.trade);
  const profile = effectiveProfile(t);
  const supp = await loadSuppression(sql, null);
  const per = Math.min(Math.max(1, Math.round(o.perZip)), PER_ZIP_MAX);
  const rows: ProspectRow[] = [];
  for (const zip of [...new Set(o.zips)].slice(0, 3)) {
    const { qualified } = scoreHomes(t, profile, await loadHomes(sql, { zips: [zip] }), supp);
    for (const q of qualified.slice(0, per)) {
      const p = q.home.input.parcel;
      rows.push({
        address: titleCase(p.addr_line), town: titleCase(q.home.municipality ?? p.city), zip: p.zip, score: q.result.score,
        reasons: q.result.reasons.slice(0, 2).map((r) => r.label), year_built: p.year_built ?? null, last_sale_date: p.last_sale_date ?? null,
        lon: q.home.lon, lat: q.home.lat,
      });
    }
  }
  return rows;
}

export interface ProspectList {
  id: string;
  business: string | null;
  trade: string;
  zips: string[];
  note: string | null;
  token: string;
  created_at: string;
  expires_at: string;
  views: number;
  home_count: number;
  converted: boolean;
}

export async function createProspectList(
  sql: Sql,
  o: { business: string; trade: string; zips: string[]; perZip: number; note?: string | null; createdBy?: string | null },
): Promise<{ id: string; token: string; rows: ProspectRow[] }> {
  const rows = await buildProspectRows(sql, o);
  const token = randomBytes(18).toString("base64url");
  const [r] = await sql<{ id: string }[]>`
    insert into prospect_request (source, business, trade, zips, note, home_count, token, created_by, expires_at, rows)
    values ('admin', ${o.business}, ${o.trade}, ${[...new Set(o.zips)].slice(0, 3)}, ${o.note ?? null}, ${rows.length}, ${token},
      ${o.createdBy ?? null}, now() + make_interval(days => ${PROSPECT_LIST_DAYS}), ${sql.json(rows as never)})
    returning id`;
  return { id: r!.id, token, rows };
}

export async function listProspectLists(sql: Sql, limit = 100): Promise<ProspectList[]> {
  return sql<ProspectList[]>`
    select r.id, r.business, r.trade, r.zips, r.note, r.token, r.created_at::text, r.expires_at::text, r.views, coalesce(r.home_count, 0) as home_count,
      exists (select 1 from org o where o.prospect_token = r.token) as converted
    from prospect_request r where r.source = 'admin' order by r.created_at desc limit ${limit}`;
}

/** The public link: the snapshot while it's live (counting the view), or `expired`. */
export async function openProspectList(sql: Sql, token: string, o: { countView?: boolean } = {}):
  Promise<{ status: "missing" } | { status: "expired"; trade: string; zips: string[] } | { status: "live"; business: string | null; trade: string; zips: string[]; rows: ProspectRow[]; expires_at: string }> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return { status: "missing" };
  const [r] = await sql<{ id: string; business: string | null; trade: string; zips: string[]; rows: ProspectRow[] | null; expires_at: string; live: boolean }[]>`
    select id, business, trade, zips, rows, expires_at::text, expires_at > now() as live from prospect_request where token = ${token} and source = 'admin'`;
  if (!r) return { status: "missing" };
  if (!r.live) return { status: "expired", trade: r.trade, zips: r.zips };
  if (o.countView) await sql`update prospect_request set views = views + 1 where id = ${r.id}`;
  return { status: "live", business: r.business, trade: r.trade, zips: r.zips, rows: r.rows ?? [], expires_at: r.expires_at };
}

/** Non-production debug control: end a list's link now. */
export async function expireProspectList(sql: Sql, id: string) {
  await sql`update prospect_request set expires_at = now() - interval '1 minute' where id = ${id} and source = 'admin'`;
}

export async function prospectListRows(sql: Sql, id: string): Promise<{ business: string | null; trade: string; rows: ProspectRow[] } | null> {
  const [r] = await sql<{ business: string | null; trade: string; rows: ProspectRow[] | null }[]>`
    select business, trade, rows from prospect_request where id = ${id} and source = 'admin'`;
  return r ? { ...r, rows: r.rows ?? [] } : null;
}

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV with the section 14 disclaimer as the last line. */
export function prospectCsv(rows: ProspectRow[]): string {
  const head = ["address", "town", "zip", "score", "reason_1", "reason_2", "year_built", "last_sale_date"];
  const lines = rows.map((r) => [r.address, r.town, r.zip, r.score, r.reasons[0] ?? "", r.reasons[1] ?? "", r.year_built, r.last_sale_date].map(cell).join(","));
  return [head.join(","), ...lines, "", cell(`${BRAND.disclaimer} Generated ${todayEt()} by ${BRAND.name}.`)].join("\r\n") + "\r\n";
}

/** Signup through a list link: keep the token on the new org (attribution). */
export async function attachProspectToken(sql: Sql, orgId: string, token: string | null | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{16,40}$/.test(token)) return;
  await sql`update org set prospect_token = ${token} where id = ${orgId} and prospect_token is null
    and exists (select 1 from prospect_request where token = ${token} and source = 'admin')`;
}
