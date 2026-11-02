// Cross-org isolation at the API layer (issue #38). The app talks to Postgres as a privileged role,
// so RLS doesn't guard the request path: every org-scoped query must filter by the session's org.
// This calls the real route handlers as org A's owner with org B's ids, and checks that each one
// answers 404/403 and that none of org B's rows change. Only the Supabase auth lookup is mocked.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";

let current: { id: string; email: string } | null = null;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: current } }) } }),
}));

const sql = getDirectSql();
const userA = { id: randomUUID(), email: `iso-a-${randomUUID().slice(0, 8)}@int.test` };
const userB = { id: randomUUID(), email: `iso-b-${randomUUID().slice(0, 8)}@int.test` };
const ids = { orgA: "", orgB: "", leadA: "", leadB: "", pieceB: "", versionB: "", templateB: "", parcelB: "" };

async function seedOrg(user: { id: string; email: string }, zip: string) {
  await sql`insert into auth.users (id, email) values (${user.id}, ${user.email})`;
  const [o] = await sql<{ id: string }[]>`
    insert into org (name, trade, onboarded_at, phone, return_address, plan, trial_ends_at, billing_state)
    values (${`Iso ${zip}`}, 'roofing', now(), '216-555-0100', ${sql.json({ name: "Iso", line1: "1 Main St", city: "Lakewood", state: "OH", zip })},
      'trial', now() + interval '14 days', 'trialing')
    returning id`;
  await sql`insert into org_member (org_id, user_id, role) values (${o!.id}, ${user.id}, 'owner')`;
  await sql`insert into territory (org_id, kind, zip) values (${o!.id}, 'zip', ${zip})`;
  await sql`insert into scoring_profile (org_id, template_key, template_version) values (${o!.id}, 'roofing', 1)`;
  const [p] = await sql<{ parcel_key: string }[]>`
    select parcel_key from parcel where zip = ${zip} and is_residential(land_use_code, data_limited) and addr_line ~ '^[0-9]+ ' order by parcel_key limit 1`;
  const [l] = await sql<{ id: string }[]>`
    insert into lead (org_id, parcel_key, score, reasons) values (${o!.id}, ${p!.parcel_key}, 70, '[]') returning id`;
  await sql`insert into lead_note (org_id, lead_id, body) values (${o!.id}, ${l!.id}, 'private note')`;
  const [m] = await sql<{ id: string }[]>`
    insert into mail_piece (org_id, lead_id, parcel_key, provider, to_address, status, send_after)
    values (${o!.id}, ${l!.id}, ${p!.parcel_key}, 'dryrun', '{"line1":"1 Test St"}', 'queued', now() + interval '10 minutes') returning id`;
  const [v] = await sql<{ id: string }[]>`
    insert into recipe_version (org_id, recipe, source, active) values (${o!.id}, '{"key":"roofing"}', 'preset', false) returning id`;
  const [t] = await sql<{ id: string }[]>`
    insert into postcard_template (org_id, trade, name, front_html, back_html, merge_defaults)
    values (${o!.id}, 'roofing', ${`Mine ${zip}`}, '<p>f</p>', '<p>b</p>', '{"design":"neighbors"}') returning id`;
  await sql`insert into org_suppression (org_id, addr_norm, reason) values (${o!.id}, ${`1 SECRET ST|${zip}`}, 'existing_customer')`;
  return { org: o!.id, lead: l!.id, piece: m!.id, version: v!.id, template: t!.id, parcel: p!.parcel_key };
}

/** Everything of org B a leak could touch, as one comparable value. */
async function snapshotB() {
  const o = ids.orgB;
  return JSON.stringify(await Promise.all([
    sql`select name, phone, website, default_offer, return_address, digest_enabled, digest_day, digest_emails::text[] from org where id = ${o}`,
    sql`select id, status, won_amount, hidden, first_touch_at from lead where org_id = ${o} order by id`,
    sql`select lead_id, body from lead_note where org_id = ${o} order by id`,
    sql`select id, status from mail_piece where org_id = ${o} order by id`,
    sql`select id, active from recipe_version where org_id = ${o} order by id`,
    sql`select kind, zip from territory where org_id = ${o} order by zip`,
    sql`select addr_norm from org_suppression where org_id = ${o} order by addr_norm`,
    sql`select email from org_invite where org_id = ${o} order by email`,
    sql`select id, name from postcard_template where org_id = ${o} order by id`,
  ]));
}

let before = "";

beforeAll(async () => {
  const a = await seedOrg(userA, "44107");
  const b = await seedOrg(userB, "44111");
  Object.assign(ids, { orgA: a.org, orgB: b.org, leadA: a.lead, leadB: b.lead, pieceB: b.piece, versionB: b.version, templateB: b.template, parcelB: b.parcel });
  before = await snapshotB();
  current = userA;
});

afterAll(async () => {
  await sql`delete from org where id in (${ids.orgA}, ${ids.orgB})`;
  await sql`delete from auth.users where id in (${userA.id}, ${userB.id})`;
  await closeAll();
});

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);
const jsonReq = (path: string, method: string, body: unknown) =>
  req(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const denied = (status: number) => expect([403, 404]).toContain(status);

describe("cross-org isolation at the API (issue #38)", () => {
  it("the harness works: org A reads its own lead", async () => {
    const { GET } = await import("../app/api/leads/[id]/route");
    const res = await GET(req(`/api/leads/${ids.leadA}`), params({ id: ids.leadA }));
    expect(res.status).toBe(200);
  });

  it("GET/PATCH /api/leads/:id with org B's lead, and a non-UUID id, are 404", async () => {
    const { GET, PATCH } = await import("../app/api/leads/[id]/route");
    denied((await GET(req(`/api/leads/${ids.leadB}`), params({ id: ids.leadB }))).status);
    expect((await GET(req("/api/leads/not-a-uuid"), params({ id: "not-a-uuid" }))).status).toBe(404);
    denied((await PATCH(jsonReq(`/api/leads/${ids.leadB}`, "PATCH", { status: "won", won_amount: 9999 }), params({ id: ids.leadB }))).status);
  });

  it("notes, bulk status and CSV export with org B's ids are refused", async () => {
    const notes = await import("../app/api/leads/[id]/notes/route");
    denied((await notes.POST(jsonReq(`/api/leads/${ids.leadB}/notes`, "POST", { body: "leak" }), params({ id: ids.leadB }))).status);
    const bulk = await import("../app/api/leads/bulk/route");
    denied((await bulk.POST(jsonReq("/api/leads/bulk", "POST", { ids: [ids.leadB], status: "skipped" }))).status);
    const csv = await import("../app/api/leads/export.csv/route");
    denied((await csv.GET(req(`/api/leads/export.csv?ids=${ids.leadB}`))).status);
  });

  it("mail: sending org B's leads or with org B's template, and cancelling org B's piece, are refused", async () => {
    const send = await import("../app/api/mail/send/route");
    const [system] = await sql<{ id: string }[]>`select id from postcard_template where org_id is null and trade = 'roofing' limit 1`;
    if (system) denied((await send.POST(jsonReq("/api/mail/send", "POST", { lead_ids: [ids.leadB], template_id: system.id, confirm: true }))).status);
    denied((await send.POST(jsonReq("/api/mail/send", "POST", { lead_ids: [ids.leadA], template_id: ids.templateB, confirm: true }))).status);
    const pieces = await import("../app/api/mail/pieces/[id]/route");
    denied((await pieces.DELETE(req(`/api/mail/pieces/${ids.pieceB}`, { method: "DELETE" }), params({ id: ids.pieceB }))).status);
  });

  it("profile: activating org B's recipe version is refused", async () => {
    const activate = await import("../app/api/profile/activate/route");
    denied((await activate.POST(jsonReq("/api/profile/activate", "POST", { version_id: ids.versionB }))).status);
  });

  it("map: a home only in org B's area has no neighbor ring for org A", async () => {
    const ring = await import("../app/api/parcels/[key]/neighbors/route");
    denied((await ring.GET(req(`/api/parcels/${ids.parcelB}/neighbors`), params({ key: ids.parcelB }))).status);
  });

  it("settings routes only ever write the caller's org", async () => {
    const terr = await import("../app/api/settings/territories/route");
    expect((await terr.PUT(jsonReq("/api/settings/territories", "PUT", { zips: ["44107", "44111"] }))).status).toBe(200);
    const team = await import("../app/api/settings/team/route");
    expect((await team.POST(jsonReq("/api/settings/team", "POST", { email: `invitee-${randomUUID().slice(0, 6)}@int.test` }))).status).toBe(201);
    const org = await import("../app/api/settings/org/route");
    expect((await org.PUT(jsonReq("/api/settings/org", "PUT", { digest_enabled: false, digest_day: 3, digest_emails: [], return_address: null }))).status).toBe(200);
    const brand = await import("../app/api/org/brand/route");
    expect((await brand.POST(jsonReq("/api/org/brand", "POST", { phone: "216-555-0199", website: "example.com", default_offer: "10% off" }))).status).toBe(200);
    const supp = await import("../app/api/settings/suppression/upload/route");
    expect((await supp.POST(jsonReq("/api/settings/suppression/upload", "POST", { lines: ["1 Other St, 44111"] }))).status).toBe(200);
    const [a] = await sql<{ phone: string; digest_day: number }[]>`select phone, digest_day from org where id = ${ids.orgA}`;
    expect(a).toEqual({ phone: "216-555-0199", digest_day: 3 });
  });

  it("none of org B's rows changed", async () => {
    expect(await snapshotB()).toBe(before);
  });
});
