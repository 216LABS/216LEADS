// HMAC for public links (print logo URL). Same secret as email links.
import { createHmac, timingSafeEqual } from "node:crypto";
import { optionalEnv } from "@216leads/db";

const secret = () => optionalEnv("EMAIL_LINK_SECRET") ?? optionalEnv("CRON_SECRET") ?? "216leads-local-email-links";

export function linkSecretSign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url").slice(0, 32);
}

export function linkSecretVerify(value: string, sig: string): boolean {
  const want = Buffer.from(linkSecretSign(value));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
