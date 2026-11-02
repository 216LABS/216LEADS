// Uptime check (D3), served at /homesignal/api/health in production. 200 when the database answers
// and daily ingest is fresh; 503 otherwise, so the Sentry uptime monitor alerts.
import { NextResponse } from "next/server";
import { getSql } from "@216leads/db";
import { ingestHealth } from "@216leads/ingest";
import { appEnv } from "@216leads/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const sql = getSql();
    await sql`select 1`;
    const ingest = await ingestHealth(sql);
    // Local and staging may not run the nightly pipeline; only production fails on stale ingest.
    const ok = appEnv() !== "production" || ingest.ok;
    return NextResponse.json(
      { status: ok ? "ok" : "degraded", env: appEnv(), db: "ok", db_ms: Date.now() - started, ingest },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { status: "down", env: appEnv(), db: "error", error: e instanceof Error ? e.message.slice(0, 200) : "unknown" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
