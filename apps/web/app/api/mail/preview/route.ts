// POST /api/mail/preview (spec 8): the builder's live front/back HTML, plus a proof PDF from the
// provider when asked (Lob test mode renders a PDF and never prints). The dry-run provider has no PDF.
import { z } from "zod";
import { mailFromEnv } from "@216leads/ingest";
import { apiOrg, body, handle, json } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { MergeSchema, previewHtml } from "@/lib/mail";

const Body = z.object({ merge: MergeSchema.required({ design: true }), proof: z.boolean().default(false) });

export const POST = handle(async (req: Request) => {
  const { org, user } = await apiOrg();
  const { merge, proof } = await body(req, Body);
  const html = await previewHtml(org, merge.design, merge);
  let pdfUrl: string | null = null;
  if (proof && rateLimit(`proof:${user.id}`, 10, 10 * 60_000)) {
    const ra = org.return_address;
    const from = { name: org.name, line1: ra?.line1 || "1474 Rosewood Ave", city: ra?.city || "Lakewood", state: ra?.state || "OH", zip: ra?.zip || "44107" };
    const r = await mailFromEnv().proof({ to: { ...from, name: "Current Resident" }, from, frontHtml: html.front, backHtml: html.back, size: "4x6" });
    pdfUrl = r?.pdfUrl ?? null;
  }
  return json({ ...html, pdfUrl });
});
