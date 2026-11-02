// GET /api/territory/search?q= : ZIP and town type-ahead for the area step (spec 9.1 step 2).
import { getSql } from "@216leads/db";
import { searchAreas } from "@216leads/ingest";
import { apiUser, handle, json } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  await apiUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 40);
  return json({ matches: await searchAreas(getSql(), q) });
});
