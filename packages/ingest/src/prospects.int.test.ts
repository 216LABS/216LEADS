// Issue #6: admin free lists against the seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { BRAND } from "@216leads/shared";
import {
  attachProspectToken, buildProspectRows, createProspectList, expireProspectList, listProspectLists, openProspectList, prospectCsv,
} from "./prospects";

const sql = getDirectSql();
const ZIPS = ["44107", "44111"];
let suppressed = "";
let orgId = "";
const made: string[] = [];

beforeAll(async () => {
  // Opt one of the top homes out of mail: it must never appear on a list.
  const [top] = await buildProspectRows(sql, { trade: "roofing", zips: ["44107"], perZip: 1 });
  const [p] = await sql<{ addr_norm: string }[]>`select addr_norm from parcel where zip = ${top!.zip} and upper(addr_line) = upper(${top!.address}) limit 1`;
  suppressed = p!.addr_norm;
  await sql`insert into suppression (addr_norm, reason) values (${suppressed}, 'homeowner_request') on conflict do nothing`;
  orgId = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Free List Signup', 'roofing') returning id`)[0]!.id;
});

afterAll(async () => {
  await sql`delete from suppression where addr_norm = ${suppressed}`;
  await sql`delete from org where id = ${orgId}`;
  if (made.length) await sql`delete from prospect_request where id = any(${made}::uuid[])`;
  await closeAll();
});

describe("admin free lists (issue #6)", () => {
  it("builds a capped list per ZIP from current scores, public facts only, minus opt-outs", async () => {
    const r = await createProspectList(sql, { business: "Test Roofing", trade: "roofing", zips: ZIPS, perZip: 25, note: "replied to email" });
    made.push(r.id);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.length).toBeLessThanOrEqual(50);
    for (const z of ZIPS) expect(r.rows.filter((x) => x.zip === z).length).toBeLessThanOrEqual(25);
    expect(Object.keys(r.rows[0]!).sort()).toEqual(["address", "last_sale_date", "lat", "lon", "reasons", "score", "town", "year_built", "zip"]);
    expect(r.rows.every((x) => x.reasons.length <= 2)).toBe(true);
    const norms = await sql<{ addr_norm: string }[]>`
      select addr_norm from parcel where zip = any(${ZIPS}) and upper(addr_line) = any(${r.rows.map((x) => x.address.toUpperCase())})`;
    expect(norms.map((n) => n.addr_norm)).not.toContain(suppressed);
    const [row] = await sql<{ source: string; trade: string; zips: string[]; home_count: number; expires_in_days: number }[]>`
      select source, trade, zips, home_count, round(extract(epoch from expires_at - now()) / 86400)::int as expires_in_days from prospect_request where id = ${r.id}`;
    expect(row).toEqual({ source: "admin", trade: "roofing", zips: ZIPS, home_count: r.rows.length, expires_in_days: 14 });
  });

  it("CSV has no name columns and ends with the disclaimer", async () => {
    const rows = await buildProspectRows(sql, { trade: "roofing", zips: ["44111"], perZip: 3 });
    const csv = prospectCsv(rows).trim().split("\r\n");
    expect(csv[0]).toBe("address,town,zip,score,reason_1,reason_2,year_built,last_sale_date");
    expect(csv[0]).not.toMatch(/owner|name|applicant/i);
    expect(csv.at(-1)).toContain(BRAND.disclaimer.slice(0, 40));
  });

  it("the share link counts views, expires, and records conversions", async () => {
    const r = await createProspectList(sql, { business: "Link Roofing", trade: "roofing", zips: ["44111"], perZip: 5 });
    made.push(r.id);
    const first = await openProspectList(sql, r.token, { countView: true });
    expect(first.status).toBe("live");
    await openProspectList(sql, r.token, { countView: true });
    expect((await listProspectLists(sql)).find((l) => l.id === r.id)).toMatchObject({ views: 2, converted: false, business: "Link Roofing" });

    await attachProspectToken(sql, orgId, r.token);
    expect((await sql<{ t: string }[]>`select prospect_token as t from org where id = ${orgId}`)[0]!.t).toBe(r.token);
    expect((await listProspectLists(sql)).find((l) => l.id === r.id)!.converted).toBe(true);

    await expireProspectList(sql, r.id);
    expect(await openProspectList(sql, r.token, { countView: true })).toEqual({ status: "expired", trade: "roofing", zips: ["44111"] });
    expect((await openProspectList(sql, "nope")).status).toBe("missing");
    await attachProspectToken(sql, orgId, "bogus-token-that-does-not-exist"); // unknown tokens are ignored
    expect((await sql<{ t: string }[]>`select prospect_token as t from org where id = ${orgId}`)[0]!.t).toBe(r.token);
  });
});
