// Settings (spec 9.7): territories, team invites and the per-town data coverage page.
import type { Sql } from "@216leads/db";

export const MAX_ZIPS = 25;

/** Replace the org's ZIP territories (other territory kinds are kept). Returns the saved ZIPs. */
export async function setZipTerritories(sql: Sql, orgId: string, zips: string[]): Promise<string[]> {
  const want = [...new Set(zips.filter((z) => /^\d{5}$/.test(z)))].slice(0, MAX_ZIPS);
  await sql.begin(async (tx) => {
    await tx`delete from territory where org_id = ${orgId} and kind = 'zip' and not (zip = any(${want}))`;
    await tx`
      insert into territory (org_id, kind, zip)
      select ${orgId}, 'zip', z from unnest(${want}::text[]) z
      where not exists (select 1 from territory t where t.org_id = ${orgId} and t.kind = 'zip' and t.zip = z)`;
  });
  return want;
}

export async function orgZips(sql: Sql, orgId: string): Promise<string[]> {
  const rows = await sql<{ zip: string }[]>`select zip from territory where org_id = ${orgId} and kind = 'zip' order by zip`;
  return rows.map((r) => r.zip);
}

export interface Invite { id: string; email: string; token: string; accepted_at: string | null; created_at: string }

/** Invite a teammate by email (spec 13: the owner invites members). Re-inviting refreshes the token. */
export async function createInvite(sql: Sql, orgId: string, email: string): Promise<Invite> {
  const [inv] = await sql<Invite[]>`
    insert into org_invite (org_id, email) values (${orgId}, ${email.toLowerCase()})
    on conflict (org_id, email) do update set token = encode(gen_random_bytes(18), 'hex'), created_at = now(), accepted_at = null
    returning id, email::text, token, accepted_at, created_at`;
  return inv!;
}

export async function listTeam(sql: Sql, orgId: string) {
  const members = await sql<{ user_id: string; email: string; role: string }[]>`
    select m.user_id, u.email::text, m.role from org_member m join auth.users u on u.id = m.user_id
    where m.org_id = ${orgId} order by m.role desc, u.email`;
  const invites = await sql<Invite[]>`
    select id, email::text, token, accepted_at, created_at from org_invite
    where org_id = ${orgId} and accepted_at is null and created_at > now() - interval '14 days' order by created_at desc`;
  return { members, invites };
}

export type AcceptResult = "joined" | "already_member" | "has_other_org" | "invalid" | "wrong_email";

/**
 * Accept an invite for a signed-in user. One org per account for now (decision 49): someone
 * already in another org can't join a second one. The invite is for one email address.
 */
export async function acceptInvite(sql: Sql, token: string, user: { id: string; email: string }): Promise<{ result: AcceptResult; orgId?: string }> {
  if (!/^[0-9a-f]{36}$/.test(token)) return { result: "invalid" };
  return sql.begin(async (tx) => {
    const [inv] = await tx<{ id: string; org_id: string; email: string }[]>`
      select id, org_id, email::text from org_invite
      where token = ${token} and accepted_at is null and created_at > now() - interval '14 days' for update`;
    if (!inv) return { result: "invalid" as const };
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) return { result: "wrong_email" as const };
    const mine = await tx<{ org_id: string }[]>`select org_id from org_member where user_id = ${user.id}`;
    if (mine.some((m) => m.org_id === inv.org_id)) return { result: "already_member" as const, orgId: inv.org_id };
    if (mine.length) return { result: "has_other_org" as const };
    await tx`insert into org_member (org_id, user_id, role) values (${inv.org_id}, ${user.id}, 'member')`;
    await tx`update org_invite set accepted_at = now() where id = ${inv.id}`;
    return { result: "joined" as const, orgId: inv.org_id };
  });
}

export interface CoverageRow {
  town: string;
  homes: number;
  permits: string | null;
  permits_since: number | null;
  violations: boolean;
  survey: boolean;
  last_permit: string | null;
}

/** Data coverage per town in the org's territory (spec 9.7): which sources, and how fresh. */
export async function territoryCoverage(sql: Sql, orgId: string): Promise<{ towns: CoverageRow[]; sources: { name: string; last_success_at: string | null }[] }> {
  const towns = await sql<CoverageRow[]>`
    with homes as (
      select p.municipality_id, count(*)::int as n, bool_or(p.survey_2022 is not null) as survey
      from parcel p
      where is_residential(p.land_use_code, p.data_limited) and p.parcel_key in (select org_territory_parcels(${orgId}))
      group by p.municipality_id
    ),
    lastp as (select source, max(event_date)::text as d from parcel_event where kind = 'permit' group by source)
    select coalesce(m.name, 'Unknown') as town, h.n as homes, m.permits_source as permits, m.permits_since,
      coalesce(m.has_violations, false) as violations, h.survey,
      lastp.d as last_permit
    from homes h left join municipality m on m.id = h.municipality_id left join lastp on lastp.source = m.permits_source
    order by h.n desc`;
  const sources = await sql<{ name: string; last_success_at: string | null }[]>`
    select name, last_success_at::text from source where enabled order by name`;
  return { towns, sources };
}
