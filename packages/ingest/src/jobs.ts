// Job registry: every job the CLI, cron routes and admin page can run.
import type { Sql } from "@216leads/db";
import { runCuyCanopy, runCuyParcelGeom, runCuyParcels, type ScopeOpts } from "./sources/cuyahoga";
import { CLE_LAYERS, runCleContractors, runCleLayer, runCleSurvey } from "./sources/cleveland";
import { runSignals } from "./signals";
import { runScoreAll } from "./score";
import { runMatchRetry } from "./retry";
import { runFemaFlood } from "./sources/fema";
import { runRecategorize } from "./recategorize";
import { runPrivacyAudit } from "./privacy";
import { runIngestWatchdog } from "./watchdog";
import { runDigest, runLifecycle } from "./digest";
import { runAutomail } from "./mail/events";
import { mailFromEnv } from "./mail/provider";

export interface JobOpts extends ScopeOpts {
  since?: string;
  org?: string;
}

export type JobFn = (sql: Sql, o: JobOpts) => Promise<unknown>;

export const JOBS: Record<string, { fn: JobFn; describe: string }> = {
  cuy_parcels: { fn: (sql, o) => runCuyParcels(sql, o), describe: "Cuyahoga parcels + sale events (delta; --full for all)" },
  cuy_parcel_geom: { fn: (sql, o) => runCuyParcelGeom(sql, o), describe: "Cuyahoga parcel centroids" },
  cuy_canopy: { fn: (sql, o) => runCuyCanopy(sql, o), describe: "CCPC tree canopy + land cover per parcel" },
  fema_flood: { fn: (sql) => runFemaFlood(sql, ["cuyahoga"]), describe: "FEMA flood hazard zones -> parcel.flood_zone" },
  cle_survey: { fn: (sql) => runCleSurvey(sql), describe: "Cleveland 2022 property survey (one-time)" },
  cle_contractors: { fn: (sql) => runCleContractors(sql), describe: "Cleveland contractor registry" },
  match: { fn: (sql) => runMatchRetry(sql), describe: "Retry unmatched records (14 days)" },
  recategorize: { fn: (sql) => runRecategorize(sql), describe: "Re-run category regex over permits/violations" },
  signals: { fn: (sql) => runSignals(sql), describe: "Recompute event-derived signals" },
  ingest_watchdog: { fn: (sql) => runIngestWatchdog(sql), describe: "Email ops if a daily ingest has not succeeded in 36 hours" },
  privacy_audit: { fn: (sql, o) => runPrivacyAudit(sql, o.limit ?? 400), describe: "Check no owner names are stored (fetches a sample live, keeps it in memory)" },
  score: { fn: (sql, o) => runScoreAll(sql, o.org), describe: "Score all orgs (or --org <id>)" },
  digest: { fn: (sql, o) => runDigest(sql, { org: o.org, force: o.full }), describe: "Weekly digest for orgs whose day is today, 06:00 ET+ (--full sends now)" },
  lifecycle: { fn: (sql) => runLifecycle(sql), describe: "Lifecycle email: trial ending (day 11)" },
  automail: { fn: (sql) => runAutomail(sql, mailFromEnv()), describe: "Auto-mail rules, follow-ups, metered postcard reporting" },
};

for (const l of CLE_LAYERS) {
  JOBS[l.code] = { fn: (sql, o) => runCleLayer(sql, l, { full: o.full, since: o.since, limit: o.limit }), describe: l.name };
}

/** Spec 5.13 daily order (ET). */
export const DAILY = ["cuy_parcels", "cle_permits", "cle_violations", "cle_rentals", "cle_condemnations", "cle_demo", "cle_boardup", "match", "signals", "score", "automail"];

/** First full load for Cuyahoga + Cleveland. */
export const CLEVELAND_FULL = [
  "cuy_parcels", "cle_contractors", "cle_permits", "cle_violations", "cle_rentals", "cle_condemnations", "cle_demo", "cle_boardup",
  "cle_coo", "cle_leadsafe", "cle_disclosure", "cle_survey", "cuy_canopy", "cuy_parcel_geom", "fema_flood", "match", "signals", "score",
];

export async function runJob(sql: Sql, name: string, o: JobOpts = {}) {
  const j = JOBS[name];
  if (!j) throw new Error(`Unknown job "${name}". Known: ${Object.keys(JOBS).join(", ")}`);
  return j.fn(sql, o);
}
