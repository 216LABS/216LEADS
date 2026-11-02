import "server-only";
import { z } from "zod";
import type { Sql } from "@216leads/db";
import { DESIGNS, printLogoUrl, renderPostcard, type Design } from "@216leads/ingest";
import type { OrgRow } from "./session";

export const MergeSchema = z.object({
  design: z.enum(DESIGNS).optional(),
  headline: z.string().trim().min(3).max(120).optional(),
  offer: z.string().trim().min(3).max(120).optional(),
  expiry: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(30).optional(),
  website: z.string().trim().max(200).nullable().optional(),
}).strict();
export type Merge = z.infer<typeof MergeSchema>;

/** Front/back HTML for a builder preview, with sample personalization. */
export async function previewHtml(org: OrgRow, design: Design, m: Merge) {
  const ra = org.return_address;
  return renderPostcard(design, {
    business: org.name,
    headline: (m.headline ?? "").replace(/\{street\}/g, "W 117th St").replace(/\{year_built\}/g, "1928"),
    offer: m.offer ?? org.default_offer ?? "Your offer goes here",
    expiry: m.expiry ?? null,
    phone: m.phone ?? org.phone ?? "(216) 555-0100",
    website: m.website ?? org.website,
    logoUrl: org.logo_path ? printLogoUrl(org.id) : null,
    returnAddress: ra?.line1 ? `${ra.line1}, ${ra.city}, ${ra.state} ${ra.zip}` : "Your return address",
  });
}

export async function templateOf(sql: Sql, orgId: string, id: string) {
  const [t] = await sql<{ id: string; name: string; merge_defaults: Merge & { design?: Design } }[]>`
    select id, name, merge_defaults from postcard_template where id = ${id} and (org_id is null or org_id = ${orgId})`;
  return t ?? null;
}
