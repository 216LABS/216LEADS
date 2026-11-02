// Row-level security (spec 4 "RLS", DevOps addendum D5): a user from org A cannot read or
// change org B's leads, profiles, CRM rows or mail jobs, and nobody signed in can read the
// public-record tables directly. Runs as the `authenticated` role with a JWT subject, the way
// Supabase's REST API does.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql, type Sql } from "./index";

const sql = getDirectSql();
const userA = randomUUID();
const userB = randomUUID();
let orgA = "";
let orgB = "";
let leadB = "";

type Tx = Parameters<Parameters<Sql["begin"]>[0]>[0];

/** Run fn as a signed-in user; the transaction is rolled back so tests leave no trace. */
async function asUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out!: T;
  await sql
    .begin(async (tx) => {
      await tx.unsafe(`set local role ${userId ? "authenticated" : "anon"}`);
      await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: userId ? "authenticated" : "anon" })}, true)`;
      out = await fn(tx);
      throw new RollbackSignal();
    })
    .catch((e) => {
      if (!(e instanceof RollbackSignal)) throw e;
    });
  return out;
}
class RollbackSignal extends Error {}

beforeAll(async () => {
  const [parcel] = await sql<{ parcel_key: string }[]>`select parcel_key from parcel limit 1`;
  if (!parcel) throw new Error("no parcels: run `pnpm db:seed` first");
  await sql`insert into auth.users (id, email) values (${userA}, ${`a-${userA}@rls.test`}), (${userB}, ${`b-${userB}@rls.test`})`;
  [orgA, orgB] = await Promise.all(
    ["RLS Org A", "RLS Org B"].map(async (name) => (await sql<{ id: string }[]>`
      insert into org (name, trade) values (${name}, 'roofing') returning id`)[0]!.id),
  );
  await sql`insert into org_member (org_id, user_id) values (${orgA}, ${userA}), (${orgB}, ${userB})`;
  for (const o of [orgA, orgB]) {
    await sql`insert into territory (org_id, kind, zip) values (${o}, 'zip', '44111')`;
    await sql`insert into scoring_profile (org_id, template_key, template_version) values (${o}, 'roofing', 1)`;
    await sql`insert into org_suppression (org_id, addr_norm) values (${o}, ${`1 TEST ST|${o.slice(0, 5)}`})`;
    const [l] = await sql<{ id: string }[]>`
      insert into lead (org_id, parcel_key, score, reasons) values (${o}, ${parcel.parcel_key}, 70, '[]') returning id`;
    await sql`insert into lead_note (org_id, lead_id, body) values (${o}, ${l!.id}, 'note')`;
    await sql`insert into lead_activity (org_id, lead_id, kind) values (${o}, ${l!.id}, 'status_change')`;
    await sql`insert into mail_piece (org_id, lead_id, parcel_key, provider, to_address)
      values (${o}, ${l!.id}, ${parcel.parcel_key}, 'dryrun', '{"line1":"1 Test St"}')`;
    if (o === orgB) leadB = l!.id;
  }
});

afterAll(async () => {
  await sql`delete from org where id in (${orgA}, ${orgB})`;
  await sql`delete from auth.users where id in (${userA}, ${userB})`;
  await closeAll();
});

const TENANT_TABLES = ["org_member", "territory", "scoring_profile", "org_suppression", "lead", "lead_note", "lead_activity", "mail_piece"];

describe("RLS: org isolation", () => {
  for (const table of TENANT_TABLES) {
    it(`user A sees only org A rows in ${table}`, async () => {
      const rows = await asUser(userA, (tx) => tx.unsafe(`select org_id::text from ${table} where org_id in ($1, $2)`, [orgA, orgB]));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => (r as { org_id: string }).org_id === orgA)).toBe(true);
    });
  }

  it("user A cannot see org B itself", async () => {
    const rows = await asUser(userA, (tx) => tx`select id from org where id in (${orgA}, ${orgB})`);
    expect(rows.map((r) => r.id)).toEqual([orgA]);
  });

  it("user A cannot change org B's lead", async () => {
    const res = await asUser(userA, (tx) => tx`update lead set status = 'won' where id = ${leadB}`);
    expect(res.count).toBe(0);
  });

  it("user A cannot write a note into org B", async () => {
    await expect(asUser(userA, (tx) => tx`insert into lead_note (org_id, lead_id, body) values (${orgB}, ${leadB}, 'x')`)).rejects.toThrow(
      /row-level security/i,
    );
  });

  it("signed-out (anon) sees no tenant rows", async () => {
    const rows = await asUser(null, (tx) => tx`select id from lead where org_id in (${orgA}, ${orgB})`);
    expect(rows.length).toBe(0);
  });
});

describe("RLS: public records are server-only", () => {
  for (const table of ["parcel", "parcel_event", "parcel_signal", "contractor", "suppression", "job_run"]) {
    it(`signed-in users cannot read ${table} directly`, async () => {
      await expect(asUser(userA, (tx) => tx.unsafe(`select 1 from ${table} limit 1`))).rejects.toThrow(/permission denied/i);
    });
  }
});
