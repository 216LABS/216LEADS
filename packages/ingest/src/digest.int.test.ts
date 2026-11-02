// Spec 12 jobs against the seeded DB (no RESEND key, so mail goes to the local outbox): the
// digest goes out once per address per week, only on the org's day, and trial-ending once.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { buildDigest, etClock, runDigest, runLifecycle } from "./digest";
import { scoreOrg } from "./score";

const sql = getDirectSql();
let orgId = "";

beforeAll(async () => {
  const [demo] = await sql<{ id: string }[]>`select id from org where name = 'Demo Roofing' order by created_at limit 1`;
  if (!demo) throw new Error("Demo Roofing missing: run `pnpm db:seed` first");
  orgId = (await sql<{ id: string }[]>`
    insert into org (name, trade, onboarded_at, digest_emails, digest_day, plan, trial_ends_at)
    values ('Digest Test Roofing', 'roofing', now(), '{digest-a@int.test,digest-b@int.test}', 1, 'trial', now() + interval '2 days 1 hour')
    returning id`)[0]!.id;
  await sql`insert into territory (org_id, kind, zip) select ${orgId}, kind, zip from territory where org_id = ${demo.id}`;
  await scoreOrg(sql, orgId);
});

afterAll(async () => {
  if (orgId) await sql`delete from org where id = ${orgId}`;
  await closeAll();
});

const sentTo = async (kind: string) =>
  (await sql<{ to_emails: string[] }[]>`select to_emails from email_log where org_id = ${orgId} and kind = ${kind}`).flatMap((r) => r.to_emails).sort();

describe("digest + lifecycle jobs (spec 12)", () => {
  it("builds a digest from the org's own leads", async () => {
    const d = await buildDigest(sql, orgId);
    expect(d!.total).toBeGreaterThan(0);
    expect(d!.leads.length).toBeGreaterThan(0);
    expect(d!.leads.length).toBeLessThanOrEqual(10);
    expect(d!.leads[0]!.url).toMatch(/\/leads\/[0-9a-f-]{36}$/);
  });

  it("sends only on the org's day after 06:00 ET, once per address per week", async () => {
    // 2026-11-02 is a Monday. 05:30 ET is too early; Tuesday is the wrong day.
    await runDigest(sql, { org: orgId, now: new Date("2026-11-02T10:30:00Z") });
    await runDigest(sql, { org: orgId, now: new Date("2026-11-03T15:00:00Z") });
    expect(await sentTo("digest")).toEqual([]);
    await runDigest(sql, { org: orgId, now: new Date("2026-11-02T12:00:00Z") });
    await runDigest(sql, { org: orgId, now: new Date("2026-11-02T13:00:00Z") });
    expect(await sentTo("digest")).toEqual(["digest-a@int.test", "digest-b@int.test"]);
  });

  it("sends trial-ending once", async () => {
    await runLifecycle(sql);
    await runLifecycle(sql);
    const owners = await sentTo("trial_ending");
    // No owner member in this test org: nothing to send to, and nothing logged.
    expect(owners).toEqual([]);
    const user = crypto.randomUUID();
    await sql`insert into auth.users (id, email) values (${user}, ${`owner-${user}@int.test`})`;
    await sql`insert into org_member (org_id, user_id, role) values (${orgId}, ${user}, 'owner')`;
    await runLifecycle(sql);
    await runLifecycle(sql);
    expect(await sentTo("trial_ending")).toEqual([`owner-${user}@int.test`]);
    await sql`delete from org_member where user_id = ${user}`;
    await sql`delete from auth.users where id = ${user}`;
  });

  it("knows the ET day, hour and ISO week", () => {
    expect(etClock(new Date("2026-11-02T12:00:00Z"))).toMatchObject({ day: 1, hour: 7, date: "2026-11-02", week: "2026-W45" });
    expect(etClock(new Date("2027-01-01T05:30:00Z"))).toMatchObject({ day: 5, date: "2027-01-01", week: "2026-W53" });
  });
});
