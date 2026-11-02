// POST /api/webhooks/lob (spec 10.2): signature-checked status updates; returned mail suppresses
// the address for every org.
import { getDirectSql } from "@216leads/db";
import { applyMailEvent, lobProvider } from "@216leads/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = process.env.LOB_API_KEY;
  if (!key) return new Response("mail not configured", { status: 503 });
  const raw = await req.text();
  const ev = lobProvider(key).verifyWebhook(raw, req.headers);
  if (!ev) return new Response("bad signature", { status: 400 });
  return Response.json({ received: true, result: await applyMailEvent(getDirectSql(), "lob", ev) });
}
