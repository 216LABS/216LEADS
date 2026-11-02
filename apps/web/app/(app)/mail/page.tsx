import Link from "next/link";
import { getDirectSql, getSql } from "@216leads/db";
import { templatesFor } from "@216leads/ingest";
import { titleCase } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { AutoMailCard, Builder, CancelBatch, type TplView } from "./mail-client";

export const metadata = { title: "Mail" };
export const dynamic = "force-dynamic";

// Mail tab (spec 9.5): recent batches with the 15-minute undo, postcard builder, auto-mail.
export default async function MailPage() {
  const { org, role } = await requireOrg();
  const sql = getSql();
  const [templates, batches, [rule]] = await Promise.all([
    templatesFor(getDirectSql(), org.id, org.trade),
    sql<{ batch_id: string; n: number; created_at: string; send_after: string; statuses: string[]; sample: string; open: number }[]>`
      select m.batch_id, count(*)::int as n, min(m.created_at)::text as created_at, min(m.send_after)::text as send_after,
        array_agg(distinct m.status) as statuses, min(p.addr_line) as sample,
        count(*) filter (where m.status in ('queued', 'submitted') and m.send_after > now())::int as open
      from mail_piece m join parcel p on p.parcel_key = m.parcel_key
      where m.org_id = ${org.id} and m.batch_id is not null group by m.batch_id order by min(m.created_at) desc limit 20`,
    sql<{ enabled: boolean; template_id: string; min_score: number; trigger_kinds: string[]; max_per_week: number; monthly_cap_cents: number; followup_days: number[] }[]>`
      select enabled, template_id, min_score, trigger_kinds::text[] as trigger_kinds, max_per_week, monthly_cap_cents, followup_days
      from mail_rule where org_id = ${org.id} order by created_at limit 1`,
  ]);
  const tpl = templates.map((t) => ({ id: t.id, name: t.name, system: t.org_id === null, merge: t.merge_defaults as TplView["merge"] }));
  return (
    <>
      <PageHeader title="Mail" sub={`${org.postcard_credits} postcard credits left · then $0.99 each`} />
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 font-bold">Recent batches</h2>
          {batches.length ? (
            <Card className="divide-y divide-line">
              {batches.map((b) => (
                <div key={b.batch_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{b.n} postcard{b.n === 1 ? "" : "s"}</span> · {titleCase(b.sample)}{b.n > 1 ? " and others" : ""}
                    <span className="block text-xs text-slate">{new Date(b.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} · {b.statuses.join(", ")}</span>
                  </span>
                  {b.open ? <CancelBatch batchId={b.batch_id} until={b.send_after} /> : null}
                </div>
              ))}
            </Card>
          ) : (
            <p className="text-sm text-slate">No postcards yet. Pick homes on <Link className="underline" href="/leads">Leads</Link> and choose &ldquo;Mail&rdquo;.</p>
          )}
        </section>
        <Builder templates={tpl} defaults={{ phone: org.phone, website: org.website, offer: org.default_offer }} />
        <AutoMailCard templates={tpl} rule={rule ?? null} canEdit={role === "owner"} />
      </div>
    </>
  );
}
