// Light scheduled jobs (spec section 8: POST /api/cron/:job with a CRON_SECRET bearer token).
// Heavy ingest pulls run on the worker; this route covers short jobs such as the watchdog.
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDirectSql } from "@216leads/db";
import { runJob } from "@216leads/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Jobs short enough to run inside a request. */
const LIGHT_JOBS = new Set(["ingest_watchdog", "signals", "score", "match", "digest", "lifecycle", "automail"]);

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !got) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await params;
  if (!LIGHT_JOBS.has(job)) return NextResponse.json({ error: `Unknown or heavy job: ${job}` }, { status: 404 });
  const started = Date.now();
  await runJob(getDirectSql(), job, {});
  return NextResponse.json({ ok: true, job, ms: Date.now() - started });
}
