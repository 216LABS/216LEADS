// POST /api/parcels/:key/neighbors/mail (spec 8): mail the ring. Same 10.3 checks, preview
// without confirm, 15-minute undo with it.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { neighborRing, RING_LIMIT, RING_RADIUS_M } from "@216leads/ingest";
import { ApiError, apiMarketOrg, body, handle } from "@/lib/api";
import { MergeSchema } from "@/lib/mail";
import { sendHomes } from "@/lib/send";

const Body = z.object({
  template_id: z.string().uuid(),
  radius_m: z.number().int().min(25).max(500).default(RING_RADIUS_M),
  limit: z.number().int().min(1).max(100).default(RING_LIMIT),
  merge: MergeSchema.optional(),
  confirm: z.boolean().default(false),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const ctx = await apiMarketOrg();
  const b = await body(req, Body);
  const ring = await neighborRing(getDirectSql(), ctx.org.id, decodeURIComponent((await params).key), { radiusM: b.radius_m, limit: b.limit });
  if (!ring) throw new ApiError(404, "That home isn't in your area");
  if (!ring.homes.length) throw new ApiError(422, "No homes around this one to mail.");
  return sendHomes(ctx, { leadIds: [], parcelKeys: ring.homes.map((h) => h.parcel_key), templateId: b.template_id, merge: b.merge, confirm: b.confirm });
});
