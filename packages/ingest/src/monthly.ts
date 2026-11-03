// Monthly "what you got" summary (issue #9): on the 1st, from 9:00 AM ET, each paying (active) org's
// owners get last month's numbers. Sent once per org, month and address (email_log dedupe key
// `monthly_summary_{yyyy_mm}:{org}:{email}`). Zero lines are left out.
import { createElement } from "react";
import type { Sql } from "@216leads/db";
import { appUrl, MonthlySummary, monthlySummarySubject, sendEmail, unsubscribeToken, type MonthlySummaryProps } from "@216leads/email";
import { titleCase, TZ } from "@216leads/shared";
import { etClock } from "./digest";
import { withJobRun } from "./runtime";

/** The calendar month before `date` (YYYY-MM-DD) as YYYY-MM. */
export function previousMonth(date: string): string {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

/** Last month's numbers for one org; anything at zero comes back undefined so the email drops it. */
export async function monthlySummaryData(sql: Sql, orgId: string, month: string): Promise<Omit<MonthlySummaryProps, "unsubscribeUrl">> {
  const from = `${month}-01`;
  const [o] = await sql<{ name: string; credits: number }[]>`select name, postcard_credits as credits from org where id = ${orgId}`;
  const [m] = await sql<{ new_homes: number; contacted: number; mailed: number; delivered: number; won: number; revenue: number }[]>`
    with r as (select ${from}::date as f, (${from}::date + interval '1 month')::date as t),
    won as (
      select distinct a.lead_id from lead_activity a, r
      where a.org_id = ${orgId} and a.kind = 'status_change' and a.data->>'to' = 'won'
        and (a.created_at at time zone ${TZ})::date >= r.f and (a.created_at at time zone ${TZ})::date < r.t
    )
    select
      (select count(*) from lead l, r where l.org_id = ${orgId} and (l.first_surfaced_at at time zone ${TZ})::date >= r.f and (l.first_surfaced_at at time zone ${TZ})::date < r.t)::int as new_homes,
      (select count(*) from lead l, r where l.org_id = ${orgId} and (l.first_touch_at at time zone ${TZ})::date >= r.f and (l.first_touch_at at time zone ${TZ})::date < r.t)::int as contacted,
      (select count(*) from mail_piece p, r where p.org_id = ${orgId} and p.status not in ('canceled', 'failed') and (p.created_at at time zone ${TZ})::date >= r.f and (p.created_at at time zone ${TZ})::date < r.t)::int as mailed,
      (select count(*) from mail_piece p, r where p.org_id = ${orgId} and p.status = 'delivered' and (p.created_at at time zone ${TZ})::date >= r.f and (p.created_at at time zone ${TZ})::date < r.t)::int as delivered,
      (select count(*) from won)::int as won,
      (select coalesce(sum(l.won_amount), 0) from lead l where l.id in (select lead_id from won))::int as revenue`;
  const top = await sql<{ id: string; addr_line: string; score: number; reasons: { label: string }[] }[]>`
    select l.id, p.addr_line, l.score, l.reasons from lead l join parcel p on p.parcel_key = l.parcel_key
    where l.org_id = ${orgId} and not l.hidden and l.visible_from <= now() and l.status in ('new', 'contacted')
    order by l.score desc, p.addr_line limit 3`;
  const pos = (x: number | undefined) => (x && x > 0 ? x : undefined);
  return {
    month: monthName(month), orgName: o?.name ?? "",
    newHomes: pos(m?.new_homes), contacted: pos(m?.contacted), mailed: pos(m?.mailed), delivered: pos(m?.delivered),
    won: pos(m?.won), revenue: pos(m?.revenue),
    // Credits only matter once the org mails; a plan that never mailed doesn't get a credits line.
    creditsLeft: m?.mailed ? pos(o?.credits) : undefined,
    top: top.map((h) => ({ address: titleCase(h.addr_line), score: h.score, reason: h.reasons[0]?.label ?? null, url: appUrl(`/leads/${h.id}`) })),
    leadsUrl: appUrl("/leads"),
  };
}

/** Send last month's summary to active orgs: the 1st from 9:00 AM ET, or now with `force`. */
export async function sendMonthlySummaries(sql: Sql, o: { now?: Date; force?: boolean; org?: string } = {}) {
  const clock = etClock(o.now ?? new Date());
  if (!o.force && (!clock.date.endsWith("-01") || clock.hour < 9)) return { sent: 0, month: null as string | null };
  const month = previousMonth(clock.date);
  const orgs = await sql<{ id: string }[]>`
    select id from org where billing_state = 'active' and onboarded_at is not null and (${o.org ?? null}::uuid is null or id = ${o.org ?? null}::uuid)`;
  let sent = 0;
  for (const org of orgs) {
    const data = await monthlySummaryData(sql, org.id, month);
    const owners = await sql<{ email: string }[]>`
      select u.email::text from org_member m join auth.users u on u.id = m.user_id
      where m.org_id = ${org.id} and m.role = 'owner'
        and not exists (select 1 from email_optout x where x.email = u.email and x.stream = 'lifecycle')`;
    for (const { email } of owners) {
      const res = await sendEmail(sql, {
        orgId: org.id, kind: "monthly_summary", dedupeKey: `monthly_summary_${month.replace("-", "_")}:${org.id}:${email.toLowerCase()}`, to: [email],
        subject: monthlySummarySubject(data),
        element: createElement(MonthlySummary, { ...data, unsubscribeUrl: appUrl(`/api/public/unsubscribe?t=${unsubscribeToken(org.id, email, "lifecycle")}`) }),
      });
      if (res) sent++;
    }
  }
  return { sent, month };
}

export async function runMonthlySummary(sql: Sql, o: { force?: boolean; org?: string } = {}) {
  return withJobRun(sql, { job: "monthly_summary" }, async (ctx) => {
    const r = await sendMonthlySummaries(sql, o);
    ctx.rowsUpserted = r.sent;
    ctx.meta.month = r.month;
  });
}
