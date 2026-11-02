// Cloudflare Turnstile check for public forms (opt-out, sample request). Without a secret
// (local, CI) it passes; the per-IP rate limit still applies.
export async function turnstileOk(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return ((await res.json()) as { success?: boolean }).success === true;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
