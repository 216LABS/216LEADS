import Link from "next/link";
import { getDirectSql } from "@216leads/db";
import { listProspectLists } from "@216leads/ingest";
import { appEnv } from "@216leads/shared";
import { TEMPLATES } from "@216leads/scoring";
import { Card, PageHeader } from "@/components/ui";
import { ProspectListForm, ExpireButton } from "./prospect-form";

export const metadata = { title: "Admin · Free lists" };
export const dynamic = "force-dynamic";

// Issue #6: "send me the list" in under a minute.
export default async function ProspectListsPage() {
  const lists = await listProspectLists(getDirectSql());
  const trades = Object.values(TEMPLATES).map((t) => ({ key: t.key, label: t.label })).sort((a, b) => a.label.localeCompare(b.label));
  const debug = appEnv() !== "production";
  return (
    <>
      <PageHeader title="Free lists" sub="A branded sample for a prospect who replied. Links are public, not indexed, and expire after 14 days." />
      <ProspectListForm trades={trades} />
      <h2 className="mb-2 mt-8 text-lg font-semibold">Past lists</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase text-slate">
            <th className="px-4 py-2">Business</th><th className="px-4 py-2">Trade</th><th className="px-4 py-2">ZIPs</th><th className="px-4 py-2">Created</th>
            <th className="px-4 py-2 text-right">Homes</th><th className="px-4 py-2 text-right">Views</th><th className="px-4 py-2">Converted</th><th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {lists.map((l) => {
              const expired = l.expires_at < new Date().toISOString();
              return (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-semibold">{l.business}</td>
                  <td className="px-4 py-2">{TEMPLATES[l.trade]?.label ?? l.trade}</td>
                  <td className="px-4 py-2">{l.zips.join(", ")}</td>
                  <td className="px-4 py-2 text-slate">{l.created_at.slice(0, 10)}{expired ? " (expired)" : ""}</td>
                  <td className="num px-4 py-2 text-right">{l.home_count}</td>
                  <td className="num px-4 py-2 text-right">{l.views}</td>
                  <td className="px-4 py-2">{l.converted ? "Yes" : "No"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link className="underline" href={`/l/${l.token}`} target="_blank" rel="noreferrer">Open</Link>
                    {debug && !expired ? <> · <ExpireButton id={l.id} /></> : null}
                  </td>
                </tr>
              );
            })}
            {!lists.length ? <tr><td colSpan={8} className="px-4 py-4 text-slate">No lists yet.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}
