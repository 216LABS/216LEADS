// GET /api/mail/pieces (spec 8): mail history, newest first. POST {batch_id} cancels a whole
// batch inside its 15-minute window.
import { z } from "zod";
import { getDirectSql, getSql } from "@216leads/db";
import { cancelPieces, mailFromEnv } from "@216leads/ingest";
import { apiOrg, body, handle, json } from "@/lib/api";

export const GET = handle(async () => {
  const { org } = await apiOrg();
  const rows = await getSql()`
    select m.id, m.batch_id, m.status, m.billed_via, m.price_cents, m.send_after, m.expected_delivery, m.created_at, p.addr_line, p.city, p.zip, m.lead_id
    from mail_piece m join parcel p on p.parcel_key = m.parcel_key
    where m.org_id = ${org.id} order by m.created_at desc limit 200`;
  return json({ pieces: rows });
});

export const POST = handle(async (req: Request) => {
  const { org } = await apiOrg();
  const { batch_id } = await body(req, z.object({ batch_id: z.string().uuid() }));
  return json({ canceled: await cancelPieces(getDirectSql(), org.id, { batchId: batch_id }, mailFromEnv()) });
});
