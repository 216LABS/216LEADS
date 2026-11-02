// GET /api/admin/prospect-lists/:id/csv: the list as CSV (no name columns; disclaimer last).
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { prospectCsv, prospectListRows } from "@216leads/ingest";
import { ApiError, handle } from "@/lib/api";
import { requireAdminApi } from "@/lib/imports";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const { id } = await params;
  const list = z.string().uuid().safeParse(id).success ? await prospectListRows(getDirectSql(), id) : null;
  if (!list) throw new ApiError(404, "Not found");
  const name = (list.business ?? "list").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return new Response(prospectCsv(list.rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="homesignal-${name}.csv"` },
  });
});
