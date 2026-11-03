// POST /api/admin/imports/preview (multipart file, city, county): columns, 8 sample rows and the
// city's saved mapping. Owner-like columns are listed but their values are never sent back.
import { getSql } from "@216leads/db";
import { OWNER_HEADER, savedMapping, sourceCode } from "@216leads/ingest";
import { handle, json } from "@/lib/api";
import { readUpload, requireAdminApi } from "@/lib/imports";

export const POST = handle(async (req: Request) => {
  await requireAdminApi();
  const { table, city } = await readUpload(await req.formData());
  const blocked = table.headers.map((h) => OWNER_HEADER.test(h));
  return json({
    source: sourceCode(city),
    headers: table.headers,
    blocked,
    rows: table.rows.length,
    sample: table.rows.slice(0, 8).map((r) => table.headers.map((_, i) => (blocked[i] ? "(hidden)" : r[i] ?? ""))),
    saved: (await savedMapping(getSql(), city))?.mapping ?? null,
  });
});
