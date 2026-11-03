// DELETE /api/mail/pieces/:id (spec 8): cancel one piece before its send time.
import { z } from "zod";
import { getSql } from "@216leads/db";
import { cancelPieces, mailFromEnv } from "@216leads/ingest";
import { ApiError, apiOrg, handle, json } from "@/lib/api";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { org } = await apiOrg();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "Not found");
  const [mine] = await getSql()`select 1 from mail_piece where id = ${id} and org_id = ${org.id}`;
  if (!mine) throw new ApiError(404, "Not found");
  const n = await cancelPieces(getSql(), org.id, { pieceId: id }, mailFromEnv());
  if (!n) throw new ApiError(409, "Too late to cancel: it's gone to print.");
  return json({ canceled: n });
});
