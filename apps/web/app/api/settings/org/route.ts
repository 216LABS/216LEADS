// GET/PUT /api/settings/org (spec 8): digest settings and the postcard return address.
// Branding (phone, website, offer, logo) goes through /api/org/brand and /api/org/logo.
import { z } from "zod";
import { getSql } from "@216leads/db";
import { apiOrg, body, handle, json } from "@/lib/api";

const Body = z.object({
  digest_enabled: z.boolean(),
  digest_day: z.number().int().min(0).max(6),
  digest_emails: z.array(z.string().trim().toLowerCase().email()).max(10),
  return_address: z.object({
    name: z.string().trim().max(80), line1: z.string().trim().max(80), line2: z.string().trim().max(80).default(""),
    city: z.string().trim().max(40), state: z.string().trim().length(2).toUpperCase(), zip: z.string().regex(/^\d{5}$/),
  }).nullable(),
});

export const GET = handle(async () => {
  const { org } = await apiOrg();
  return json({ digest_enabled: org.digest_enabled, digest_day: org.digest_day, digest_emails: org.digest_emails, return_address: org.return_address });
});

export const PUT = handle(async (req: Request) => {
  const { org, role } = await apiOrg();
  const b = await body(req, Body);
  if (role !== "owner") return json({ error: "Only the account owner can change these" }, 403);
  await getSql()`
    update org set digest_enabled = ${b.digest_enabled}, digest_day = ${b.digest_day}, digest_emails = ${[...new Set(b.digest_emails)]}::citext[],
      return_address = ${b.return_address ? getSql().json(b.return_address) : null}
    where id = ${org.id}`;
  return json({ ok: true });
});
