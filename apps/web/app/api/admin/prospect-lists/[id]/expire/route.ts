// POST /api/admin/prospect-lists/:id/expire: debug control to test the expired page (not in production).
import { z } from "zod";
import { getSql } from "@216leads/db";
import { expireProspectList } from "@216leads/ingest";
import { appEnv } from "@216leads/shared";
import { ApiError, handle, json } from "@/lib/api";
import { requireAdminApi } from "@/lib/imports";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  if (appEnv() === "production") throw new ApiError(404, "Not found");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "Not found");
  await expireProspectList(getSql(), id);
  return json({ ok: true });
});
