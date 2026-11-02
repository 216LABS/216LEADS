// POST /api/public/sample (spec 8): a prospect asks for their trade + ZIP sample. No login;
// Turnstile when configured; 5 per IP per hour.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { saveProspect } from "@216leads/ingest";
import { ApiError, body, handle, json } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp, turnstileOk } from "@/lib/turnstile";

const Body = z.object({
  email: z.string().trim().email().max(200),
  business: z.string().trim().max(120).optional(),
  trade: z.string().trim().max(40).optional(),
  zips: z.array(z.string().regex(/^\d{5}$/)).max(10).optional(),
  token: z.string().max(4000).optional(),
});

export const POST = handle(async (req: Request) => {
  const ip = clientIp(req);
  if (!(await rateLimit(`sample:${ip}`, 5, 60 * 60_000))) throw new ApiError(429, "Too many requests. Try again in an hour.");
  const b = await body(req, Body);
  if (!(await turnstileOk(b.token, ip))) throw new ApiError(400, "Please complete the check and try again.");
  await saveProspect(getDirectSql(), b);
  return json({ ok: true, message: "Thanks. We'll email your sample within one business day." });
});
