// GET /api/mail/templates: the 3 system templates for the org's trade plus its saved ones.
// POST: save a template from the builder (spec 8, 9.5).
import { z } from "zod";
import { getSql } from "@216leads/db";
import { templatesFor } from "@216leads/ingest";
import { apiOrg, body, handle, json } from "@/lib/api";
import { MergeSchema } from "@/lib/mail";

export const GET = handle(async () => {
  const { org } = await apiOrg();
  return json({ templates: await templatesFor(getSql(), org.id, org.trade) });
});

const Body = z.object({ name: z.string().trim().min(2).max(60), merge: MergeSchema.required({ design: true }) });

export const POST = handle(async (req: Request) => {
  const { org } = await apiOrg();
  const b = await body(req, Body);
  const [t] = await getSql()<{ id: string }[]>`
    insert into postcard_template (org_id, trade, name, front_html, back_html, merge_defaults)
    values (${org.id}, ${org.trade}, ${b.name}, ${`design:${b.merge.design}`}, ${`design:${b.merge.design}`}, ${getSql().json(b.merge)})
    returning id`;
  return json({ id: t!.id }, 201);
});
