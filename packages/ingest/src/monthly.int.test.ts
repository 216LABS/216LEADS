// Issue #9: the monthly summary against the seeded DB. Emails land in email_outbox (not production).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { previousMonth, sendMonthlySummaries } from "./monthly";

const sql = getDirectSql();
const users = [randomUUID(), randomUUID(), randomUUID()];
const orgs: string[] = [];
const email = (i: number) => `monthly-${users[i]!.slice(0, 8)}@int.test`;
// Nov 1 2026, after the switch back to EST: 14:30 UTC is 9:30 AM ET.
const NOV1_930 = new Date("2026-11-01T14:30:00Z");

async function org(i: number, name: string, billing: "active" | "trialing") {
  await sql`insert into auth.users (id, email) values (${users[i]!}, ${email(i)})`;
  const [o] = await sql<{ id: string }[]>`
    insert into org (name, trade, onboarded_at, plan, plan_status, billing_state, postcard_credits)
    values (${name}, 'roofing', now(), ${billing === "active" ? "pro" : "trial"}, ${billing === "active" ? "active" : null}, ${billing}, 40) returning id`;
  await sql`insert into org_member (org_id, user_id, role) values (${o!.id}, ${users[i]!}, 'owner')`;
  orgs.push(o!.id);
  return o!.id;
}

const outbox = (to: string) => sql<{ subject: string; text: string }[]>`select subject, text from email_outbox where ${to} = any(to_emails) order by id`;

beforeAll(async () => {
  const busy = await org(0, "Busy Roofing", "active");
  await org(1, "Quiet Roofing", "active");
  await org(2, "Trial Roofing", "trialing");
  const parcels = await sql<{ parcel_key: string }[]>`select parcel_key from parcel where is_residential(land_use_code, data_limited) order by parcel_key limit 2`;
  const [l] = await sql<{ id: string }[]>`
    insert into lead (org_id, parcel_key, score, reasons, status, won_amount, first_surfaced_at, first_touch_at)
    values (${busy}, ${parcels[0]!.parcel_key}, 88, '[{"label":"Sold 2 months ago"}]', 'won', 9000, '2026-10-10 15:00Z', '2026-10-12 15:00Z') returning id`;
  await sql`insert into lead (org_id, parcel_key, score, reasons) values (${busy}, ${parcels[1]!.parcel_key}, 80, '[{"label":"Built 1925"}]')`;
  await sql`insert into lead_activity (org_id, lead_id, kind, data, created_at) values (${busy}, ${l!.id}, 'status_change', '{"from":"contacted","to":"won"}', '2026-10-20 15:00Z')`;
  for (const status of ["delivered", "mailed"]) {
    await sql`insert into mail_piece (org_id, lead_id, parcel_key, provider, to_address, status, created_at)
      values (${busy}, ${l!.id}, ${parcels[0]!.parcel_key}, 'dryrun', '{"line1":"1 Test St"}', ${status}, '2026-10-15 15:00Z')`;
  }
});

afterAll(async () => {
  for (let i = 0; i < users.length; i++) await sql`delete from email_outbox where ${email(i)} = any(to_emails)`;
  await sql`delete from email_log where org_id = any(${orgs}::uuid[])`;
  await sql`delete from org where id = any(${orgs}::uuid[])`;
  await sql`delete from auth.users where id = any(${users}::uuid[])`;
  await closeAll();
});

describe("monthly summary (issue #9)", () => {
  it("waits for the 1st at 9:00 AM ET", async () => {
    expect(previousMonth("2026-11-01")).toBe("2026-10");
    expect(previousMonth("2027-01-01")).toBe("2026-12");
    expect((await sendMonthlySummaries(sql, { now: new Date("2026-11-01T13:30:00Z") })).sent).toBe(0); // 8:30 AM
    expect((await sendMonthlySummaries(sql, { now: new Date("2026-11-02T15:00:00Z") })).sent).toBe(0); // the 2nd
  });

  it("sends last month's real numbers to paying orgs once; trials get nothing", async () => {
    const first = await sendMonthlySummaries(sql, { now: NOV1_930 });
    expect(first.month).toBe("2026-10");
    const [busy] = await outbox(email(0));
    expect(busy!.subject).toBe("your October with 216 HomeSignal");
    expect(busy!.text).toContain("1 new home matched your area");
    expect(busy!.text).toContain("You reached out to 1");
    expect(busy!.text).toContain("2 postcards mailed, 1 delivered so far");
    expect(busy!.text).toContain("1 job marked won, $9,000 in work");
    expect(busy!.text).toContain("40 postcard credits left");
    expect(await outbox(email(2))).toHaveLength(0);

    await sendMonthlySummaries(sql, { now: new Date("2026-11-01T18:30:00Z") }); // the hourly job runs again
    expect(await outbox(email(0))).toHaveLength(1);
  });

  it("an org that didn't mail gets no postcard or credits lines", async () => {
    const [quiet] = await outbox(email(1));
    expect(quiet!.text).not.toMatch(/postcards? mailed|credits? left/);
  });
});
