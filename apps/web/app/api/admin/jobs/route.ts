import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { JOBS, runJob } from "@216leads/ingest";
import { ApiError, body, handle, json } from "@/lib/api";
import { getUser, isAdmin } from "@/lib/session";

const Body = z.object({ job: z.string() });

/** Start a job in the background from /admin/jobs. Long pulls belong on the worker; this is a convenience. */
export const POST = handle(async (req: Request) => {
  const user = await getUser();
  if (!user || !isAdmin(user.email)) throw new ApiError(404, "Not found");
  const { job } = await body(req, Body);
  if (!JOBS[job]) throw new ApiError(400, `Unknown job ${job}`);
  void runJob(getDirectSql(), job, {}).catch((e) => console.error(`admin job ${job} failed`, e));
  return json({ started: job }, 202);
});
