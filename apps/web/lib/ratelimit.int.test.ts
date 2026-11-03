// Shared rate limiter (issue #39) against the database: two separate connections stand in for two
// serverless instances and must share one count; windows roll over; a store error fails open.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeAll, getDirectSql, getSql, type Sql } from "@216leads/db";
import { rateLimitWith } from "./ratelimit";

vi.mock("@sentry/nextjs", () => ({ captureMessage: () => undefined }));

// Times are this hour, not fixed dates: the limiter prunes windows older than a day on about 1 call
// in 200, so a fixed past date made these tests fail now and then once it was a day old.
const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;

// Two separate connection pools, like two serverless instances.
const serverA = getDirectSql();
const serverB = getSql();

afterAll(async () => {
  await serverA`delete from rate_limit where key like 'test:%'`;
  await closeAll();
});

describe("shared rate limiter (issue #39)", () => {
  it("two instances share one count: request 61 in a minute is refused", async () => {
    const key = `test:${randomUUID()}`;
    const now = hour + 5_000;
    const results: boolean[] = [];
    for (let i = 0; i < 61; i++) results.push(await rateLimitWith(i % 2 ? serverB : serverA, key, 60, 60_000, now + i));
    expect(results.slice(0, 60).every(Boolean)).toBe(true);
    expect(results[60]).toBe(false);
    const [row] = await serverA<{ hits: number }[]>`select hits from rate_limit where key = ${key}`;
    expect(row!.hits).toBe(61);
  });

  it("the next window starts fresh", async () => {
    const key = `test:${randomUUID()}`;
    const t = hour;
    expect(await rateLimitWith(serverA, key, 1, 60_000, t)).toBe(true);
    expect(await rateLimitWith(serverB, key, 1, 60_000, t + 30_000)).toBe(false);
    expect(await rateLimitWith(serverB, key, 1, 60_000, t + 60_000)).toBe(true);
  });

  it("per-IP hourly limits work the same way (opt-out: 10 an hour)", async () => {
    const key = `test:optout:${randomUUID()}`;
    const t = hour + 10 * 60_000;
    for (let i = 0; i < 10; i++) expect(await rateLimitWith(serverA, key, 10, 3_600_000, t + i * 1000)).toBe(true);
    expect(await rateLimitWith(serverB, key, 10, 3_600_000, t + 20 * 60_000)).toBe(false);
  });

  it("fails open when the store errors", async () => {
    const broken = (() => Promise.reject(new Error("connection refused"))) as unknown as Sql;
    expect(await rateLimitWith(broken, `test:${randomUUID()}`, 1, 60_000)).toBe(true);
  });
});
