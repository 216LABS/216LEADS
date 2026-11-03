// POST /api/admin/prospect-lists (issue #6): build a free list for a named prospect.
import { z } from "zod";
import { getSql } from "@216leads/db";
import { createProspectList, PER_ZIP_MAX } from "@216leads/ingest";
import { hasTemplate } from "@216leads/scoring";
import { ApiError, body, handle, json } from "@/lib/api";
import { requireAdminApi } from "@/lib/imports";

const Body = z.object({
  business: z.string().trim().min(2).max(120),
  trade: z.string().refine(hasTemplate, "Unknown trade"),
  zips: z.array(z.string().regex(/^\d{5}$/)).min(1).max(3),
  per_zip: z.number().int().min(1).max(PER_ZIP_MAX).default(25),
  note: z.string().trim().max(500).optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await requireAdminApi();
  const b = await body(req, Body);
  const r = await createProspectList(getSql(), { business: b.business, trade: b.trade, zips: b.zips, perZip: b.per_zip, note: b.note ?? null, createdBy: user.id });
  if (!r.rows.length) throw new ApiError(422, "No homes qualified in those ZIP codes. Try another trade or ZIP.");
  return json({ id: r.id, homes: r.rows.length, link: `/l/${r.token}`, csv: `/api/admin/prospect-lists/${r.id}/csv` }, 201);
});
