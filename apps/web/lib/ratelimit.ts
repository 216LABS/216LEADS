// Shared rate limiter (spec 13: 60 requests a minute per user; issue #39). Counts live in Postgres
// (`rate_limit`, one row per key per fixed window) so every serverless instance shares them. If the
// store errors, the request is allowed (fail open) and a warning goes to Sentry, so a database
// hiccup can't lock everyone out.
import type { Sql } from "@216leads/db";
import { getDirectSql } from "@216leads/db";

/** Old windows are deleted on roughly 1 call in this many. */
const PRUNE_EVERY = 200;

export async function rateLimitWith(sql: Sql, key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const start = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const [row] = await sql<{ hits: number }[]>`
      insert into rate_limit (key, window_start, hits) values (${key}, ${start}, 1)
      on conflict (key, window_start) do update set hits = rate_limit.hits + 1
      returning hits`;
    if (Math.random() * PRUNE_EVERY < 1) {
      void sql`delete from rate_limit where window_start < now() - interval '1 day'`.catch(() => undefined);
    }
    return (row?.hits ?? 1) <= limit;
  } catch (e) {
    console.warn(`rate limit store failed for ${key}; allowing`, e instanceof Error ? e.message : e);
    void import("@sentry/nextjs").then((s) => s.captureMessage(`rate limit store failed: ${e instanceof Error ? e.message : String(e)}`, "warning")).catch(() => undefined);
    return true;
  }
}

/** True when this request is within `limit` per `windowMs` for `key`. */
export function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return rateLimitWith(getDirectSql(), key, limit, windowMs);
}
