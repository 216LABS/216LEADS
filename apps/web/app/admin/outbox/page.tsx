import Link from "next/link";
import { getSql } from "@216leads/db";
import { appEnv } from "@216leads/shared";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin · Outbox" };
export const dynamic = "force-dynamic";

// Issue #40: outside production every email lands in email_outbox; QA reads them here.
export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sql = getSql();
  const rows = await sql<{ id: string; created_at: string; to_emails: string[]; subject: string; tag: string }[]>`
    select id::text, created_at::text, to_emails, subject, tag from email_outbox order by id desc limit 100`;
  const id = (await searchParams).id;
  const [open] = id && /^\d+$/.test(id)
    ? await sql<{ id: string; to_emails: string[]; reply_to: string | null; subject: string; html: string; text: string; headers: Record<string, string> }[]>`
        select id::text, to_emails, reply_to, subject, html, text, headers from email_outbox where id = ${id}`
    : [];
  return (
    <>
      <PageHeader title="Outbox" sub={`Emails not sent in ${appEnv()} (only production sends). Kept 30 days.`} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="divide-y divide-line text-sm">
          {rows.length ? rows.map((r) => (
            <Link key={r.id} href={`/admin/outbox?id=${r.id}`} aria-current={r.id === open?.id ? "true" : undefined}
              className={`focus-ring block px-4 py-3 hover:bg-navy-50 ${r.id === open?.id ? "bg-navy-50" : ""}`}>
              <div className="font-semibold">{r.subject}</div>
              <div className="text-xs text-slate">{r.tag} · {r.to_emails.join(", ")} · {r.created_at.slice(0, 16).replace("T", " ")}</div>
            </Link>
          )) : <p className="p-4 text-slate">Nothing yet.</p>}
        </Card>
        {open ? (
          <Card className="p-4 text-sm">
            <div className="mb-2 space-y-0.5">
              <div><span className="text-slate">To:</span> {open.to_emails.join(", ")}</div>
              {open.reply_to ? <div><span className="text-slate">Reply-To:</span> {open.reply_to}</div> : null}
              <div><span className="text-slate">Subject:</span> <span className="font-semibold">{open.subject}</span></div>
            </div>
            {open.html ? (
              // Rendered with no scripts and no same-origin access.
              <iframe title={open.subject} srcDoc={open.html} sandbox="" className="h-[640px] w-full rounded-[6px] border border-line bg-white" />
            ) : <pre className="whitespace-pre-wrap rounded-[6px] bg-paper p-3">{open.text}</pre>}
          </Card>
        ) : null}
      </div>
    </>
  );
}
