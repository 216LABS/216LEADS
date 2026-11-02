// GET /api/profile/categories: real permit matches per category, with the Addendum A5
// low-confidence flag (fewer than 20 real matches). Counts only; no parcel data.
import { getSql } from "@216leads/db";
import { categoryMatchCounts } from "@216leads/ingest";
import { apiOrg, handle, json } from "@/lib/api";

export const GET = handle(async () => {
  await apiOrg();
  return json({ categories: await categoryMatchCounts(getSql()) });
});
