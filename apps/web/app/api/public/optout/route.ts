// POST /api/public/optout (spec 8, 14, issue #2): homeowner stop-mail. No login; Turnstile when
// configured; 10 per IP per hour; the same answer whether or not we know the home.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { mailFromEnv, optOut } from "@216leads/ingest";
import { ApiError, body, handle, json } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ street: z.string().trim().min(3).max(120), zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/), token: z.string().max(4000).optional() });

async function turnstileOk(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured (local); the rate limit still applies
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return ((await res.json()) as { success?: boolean }).success === true;
}

export const POST = handle(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`optout:${ip}`, 10, 60 * 60_000)) throw new ApiError(429, "Too many requests. Try again in an hour.");
  const b = await body(req, Body);
  if (!(await turnstileOk(b.token, ip))) throw new ApiError(400, "Please complete the check and try again.");
  await optOut(getDirectSql(), b.street, b.zip, mailFromEnv());
  return json({ ok: true, message: "Got it. We'll stop mail to this address within 2 business days." });
});
