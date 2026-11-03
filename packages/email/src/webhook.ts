// Resend webhook signatures (Svix scheme): HMAC-SHA256 over "{id}.{timestamp}.{body}" with the
// base64 secret after "whsec_", sent as one or more "v1,<base64>" values. Used for email.opened,
// which feeds the "digest unopened" at-risk rule (issue #10).
import { createHmac, timingSafeEqual } from "node:crypto";

export function signResendPayload(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

export function verifyResendWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const want = Buffer.from(signResendPayload(secret, id, ts, body).slice(3));
  return signature.split(" ").some((part) => {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig) return false;
    const got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
