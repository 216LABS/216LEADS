// GET /api/public/logo/:org?s=<sig>: an org's logo for the print provider, which can't sign in.
// The link is signed per org, so logos can't be listed or guessed.
import { getDirectSql } from "@216leads/db";
import { linkSecretVerify } from "@216leads/ingest";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/turnstile";

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  if (!(await rateLimit(`logo:${clientIp(req)}`, 300, 60_000))) return new Response("slow down", { status: 429 });
  const { org } = await params;
  const sig = new URL(req.url).searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(org) || !linkSecretVerify(`logo:${org}`, sig)) return new Response("not found", { status: 404 });
  const [row] = await getDirectSql()<{ content_type: string; data: Buffer }[]>`select content_type, data from org_logo where org_id = ${org}`;
  if (!row) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": row.content_type, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
