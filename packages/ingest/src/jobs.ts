// Job registry: every job the CLI, cron routes and admin page can run.
import type { Sql } from "@216leads/db";
import { runCuyCanopy, runCuyParcelGeom, runCuyParcels, type ScopeOpts } from "./sources/cuyahoga";
import { CLE_LAYERS, runCleContractors, runCleLayer, runCleSurvey } from "./sources/cleveland";
import { runSignals } from "./signals";
import { runScoreAll } from "./score";
import { runMatchRetry } from "./retry";

export interface JobOpts extends ScopeOpts {
  since?: string;
  org?: string;
}

export type JobFn = (sql: Sql, o: JobOpts) => Promise<unknown>;

export const JOBS: Record<string, { fn: JobFn; describe: string }> = {
  cuy_parcels: { fn: (sql, o) => runCuyParcels(sql, o), describe: "Cuyahoga parcels + sale events (delta; --full for all)" },
  cuy_parcel_geom: { fn: (sql, o) => runCuyParcelGeom(sql, o), describe: "Cuyahoga parcel centroids" },
  cuy_canopy: { fn: (sql, o) => runCuyCanopy(sql, o), describe: "CCPC tree canopy + land cover per parcel" },
  cle_survey: { fn: (sql) => runCleSurvey(sql), describe: "Cleveland 2022 property survey (one-time)" },
  cle_contractors: { fn: (sql) => runCleContractors(sql), describe: "Cleveland contractor registry" },
  match: { fn: (sql) => runMatchRetry(sql), describe: "Retry unmatched records (14 days)" },
  signals: { fn: (sql) => runSignals(sql), describe: "Recompute event-derived signals" },
  score: { fn: (sql, o) => runScoreAll(sql, o.org), describe: "Score all orgs (or --org <id>)" },
};

for (const l of CLE_LAYERS) {
  JOBS[l.code] = { fn: (sql, o) => runCleLayer(sql, l, { full: o.full, since: o.since, limit: o.limit }), describe: l.name };
}

/** Spec 5.13 daily order (ET). */
export const DAILY = ["cuy_parcels", "cle_permits", "cle_violations", "cle_rentals", "cle_condemnations", "cle_demo", "cle_boardup", "match", "signals", "score"];

/** First full load for Cuyahoga + Cleveland. */
export const CLEVELAND_FULL = [
  "cuy_parcels", "cle_contractors", "cle_permits", "cle_violations", "cle_rentals", "cle_condemnations", "cle_demo", "cle_boardup",
  "cle_survey", "cuy_canopy", "cuy_parcel_geom", "signals", "score",
];

export async function runJob(sql: Sql, name: string, o: JobOpts = {}) {
  const j = JOBS[name];
  if (!j) throw new Error(`Unknown job "${name}". Known: ${Object.keys(JOBS).join(", ")}`);
  return j.fn(sql, o);
}
