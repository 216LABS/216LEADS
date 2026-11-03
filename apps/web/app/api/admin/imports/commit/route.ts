// POST /api/admin/imports/commit (multipart file, city, county, mapping): import the mapped rows.
import { z } from "zod";
import { getSql } from "@216leads/db";
import { IMPORT_FIELDS, mappingErrors, runRecordsImport, type ImportMapping } from "@216leads/ingest";
import { ApiError, handle, json } from "@/lib/api";
import { readUpload, requireAdminApi } from "@/lib/imports";

const Mapping = z.record(z.enum(IMPORT_FIELDS), z.string().max(200));

export const POST = handle(async (req: Request) => {
  await requireAdminApi();
  const form = await req.formData();
  const { table, city, county } = await readUpload(form);
  const parsed = Mapping.safeParse(JSON.parse(String(form.get("mapping") ?? "{}")));
  if (!parsed.success) throw new ApiError(400, "Bad mapping");
  const mapping = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v)) as ImportMapping;
  const errs = mappingErrors(mapping, table.headers);
  if (errs.length) throw new ApiError(422, errs.join(". "));
  return json(await runRecordsImport(getSql(), { county, city, table, mapping }));
});
