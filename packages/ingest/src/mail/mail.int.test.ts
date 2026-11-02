// Spec 10.3 pre-send checks, credits, undo, opt-out (issue #2), returned mail and auto-mail,
// against the seeded DB with the dry-run provider.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { scoreOrg } from "../score";
import { applyMailEvent, optOut, runAutomail } from "./events";
import { dryRunProvider } from "./provider";
import { cancelPieces, commitSend, ensureSystemTemplates, planSend } from "./send";

const sql = getDirectSql();
const mail = dryRunProvider();
let orgId = "";
let tpl = "";
let leads: { id: string; parcel_key: string; addr_line: string; zip: string }[] = [];

beforeAll(async () => {
  const [demo] = await sql<{ id: string }[]>`select id from org where name = 'Demo Roofing' order by created_at limit 1`;
  orgId = (await sql<{ id: string }[]>`
    insert into org (name, trade, onboarded_at, trial_ends_at, billing_state, postcard_credits, phone, return_address)
    values ('Mail Test Roofing', 'roofing', now(), now() + interval '10 days', 'trialing', 3, '(216) 555-0100',
      '{"name":"Mail Test","line1":"1474 Rosewood Ave","city":"Lakewood","state":"OH","zip":"44107"}')
    returning id`)[0]!.id;
  await sql`insert into territory (org_id, kind, zip) select ${orgId}, kind, zip from territory where org_id = ${demo!.id}`;
  await scoreOrg(sql, orgId);
  await ensureSystemTemplates(sql);
  tpl = (await sql<{ id: string }[]>`select id from postcard_template where org_id is null and trade = 'roofing' order by name limit 1`)[0]!.id;
  leads = await sql`
    select l.id, l.parcel_key, p.addr_line, p.zip from lead l join parcel p on p.parcel_key = l.parcel_key
    where l.org_id = ${orgId} and p.addr_line ~ '^[0-9]+ ' order by l.score desc limit 6`;
});

afterAll(async () => {
  await sql`delete from suppression where parcel_key = any(${leads.map((l) => l.parcel_key)})`;
  await sql`delete from org where id = ${orgId}`;
  await closeAll();
});

describe("mail", () => {
  it("checks in spec order, uses credits first, and stops at no funds on a trial", async () => {
    await sql`insert into suppression (addr_norm, parcel_key, reason) select addr_norm, parcel_key, 'legal' from parcel where parcel_key = ${leads[0]!.parcel_key}`;
    await sql`insert into org_suppression (org_id, addr_norm, parcel_key) select ${orgId}, addr_norm, parcel_key from parcel where parcel_key = ${leads[1]!.parcel_key}`;
    const plan = await planSend(sql, { orgId, leadIds: leads.map((l) => l.id), parcelKeys: ["cuyahoga:not-a-parcel"], templateId: tpl });
    expect(plan.requested).toBe(7);
    expect(plan.removed).toMatchObject({ territory: 1, suppression: 1, your_list: 1, no_funds: 1 });
    expect(plan.pieces).toHaveLength(3);
    expect(plan.pieces.every((p) => p.billed_via === "credit" && p.to.name === "Current Resident")).toBe(true);
    expect(plan.costCents).toBe(0);
  });

  it("sends, then the 30-day rule blocks a repeat; undo refunds credits", async () => {
    const req = { orgId, leadIds: leads.slice(2, 4).map((l) => l.id), templateId: tpl };
    const res = await commitSend(sql, req, await planSend(sql, req), mail);
    expect(res).toMatchObject({ queued: 2, failed: 0 });
    const [o] = await sql<{ postcard_credits: number }[]>`select postcard_credits from org where id = ${orgId}`;
    expect(o!.postcard_credits).toBe(1);
    expect((await planSend(sql, req)).removed.mailed_recently).toBe(2);
    expect(await cancelPieces(sql, orgId, { batchId: res.batchId }, mail)).toBe(2);
    const [after] = await sql<{ postcard_credits: number }[]>`select postcard_credits from org where id = ${orgId}`;
    expect(after!.postcard_credits).toBe(3);
  });

  it("homeowner opt-out suppresses for everyone and cancels queued pieces (issue #2)", async () => {
    const l = leads[4]!;
    const req = { orgId, leadIds: [l.id], templateId: tpl };
    await commitSend(sql, req, await planSend(sql, req), mail);
    const r = await optOut(sql, l.addr_line, l.zip, mail);
    expect(r).toEqual({ matched: true, canceled: 1 });
    expect((await planSend(sql, { orgId, parcelKeys: [l.parcel_key], templateId: tpl })).removed.suppression).toBe(1);
    expect(await optOut(sql, "99999 Nowhere Rd", "44107", mail)).toEqual({ matched: false, canceled: 0 });
  });

  it("returned mail adds the address to suppression", async () => {
    const l = leads[5]!;
    const req = { orgId, leadIds: [l.id], templateId: tpl };
    await commitSend(sql, req, await planSend(sql, req), mail);
    const [p] = await sql<{ provider_id: string }[]>`select provider_id from mail_piece where org_id = ${orgId} and parcel_key = ${l.parcel_key}`;
    expect(await applyMailEvent(sql, "dryrun", { providerId: p!.provider_id, status: "returned", at: new Date().toISOString(), raw: "test" })).toBe("returned");
    const [s] = await sql<{ reason: string }[]>`select reason from suppression where parcel_key = ${l.parcel_key}`;
    expect(s!.reason).toBe("returned_mail");
  });

  it("auto-mail sends fresh triggered leads within the weekly cap", async () => {
    await sql`update lead set trigger_label = 'Just sold', trigger_date = current_date - 2, score = 90
      where id in (select id from lead where org_id = ${orgId} and status = 'new' and parcel_key <> all(${leads.map((l) => l.parcel_key)}) order by id limit 5)`;
    await sql`update org set postcard_credits = 10 where id = ${orgId}`;
    await sql`insert into mail_rule (org_id, template_id, enabled, min_score, trigger_kinds, max_per_week) values (${orgId}, ${tpl}, true, 70, '{sale}', 2)`;
    await runAutomail(sql, mail);
    await runAutomail(sql, mail);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from mail_piece where org_id = ${orgId} and rule_id is not null`;
    expect(n!.n).toBe(2);
  });
});
