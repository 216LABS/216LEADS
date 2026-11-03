// POST /api/org/brand: phone, website and default offer for postcards (spec 9.1 step 4).
import { z } from "zod";
import { getSql } from "@216leads/db";
import { apiOrg, body, handle, json } from "@/lib/api";

const Body = z.object({
  phone: z.string().trim().max(30).regex(/^[\d\s().+-]*$/, "Use digits, spaces and ( ) - + only").nullable(),
  website: z.string().trim().max(200).nullable()
    .transform((w) => (w && !/^https?:\/\//i.test(w) ? `https://${w}` : w || null))
    .refine((w) => w === null || URL.canParse(w), "Enter a web address like yoursite.com"),
  default_offer: z.string().trim().max(120).nullable(),
});

export const POST = handle(async (req: Request) => {
  const { org } = await apiOrg();
  const b = await body(req, Body);
  await getSql()`
    update org set phone = ${b.phone || null}, website = ${b.website}, default_offer = ${b.default_offer || null} where id = ${org.id}`;
  return json({ ok: true, website: b.website });
});
