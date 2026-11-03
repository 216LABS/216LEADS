import Link from "next/link";
import { getSql } from "@216leads/db";
import { BRAND, cronText, etDateTime } from "@216leads/shared";
import { LegalView, legalMetadata } from "@/components/legal-view";

export const metadata = legalMetadata("data");
export const dynamic = "force-dynamic";

// Issue #3: every live source from the `source` table, with its schedule and last success.
export default async function DataPage() {
  const sources = await getSql()<{ name: string; url: string; schedule_cron: string; last_success_at: string | null; code: string }[]>`
    select code, name, url, schedule_cron, last_success_at from source where code not like 'rr_%' order by name`;
  return (
    <LegalView page="data">
      <div className="mt-6 overflow-x-auto rounded-[12px] border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line"><th className="px-4 py-2">Source</th><th className="px-4 py-2">Refresh</th><th className="px-4 py-2">Last updated</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.code} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{/^https?:/.test(s.url) ? <a href={s.url} className="underline" rel="noreferrer">{s.name}</a> : s.name}</td>
                <td className="px-4 py-2 text-slate">{cronText(s.schedule_cron)}</td>
                <td className="px-4 py-2 text-slate">{s.last_success_at ? etDateTime(s.last_success_at) : "not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-sm text-slate">{BRAND.disclaimer}</p>
      <p className="mt-2 text-sm">Homeowners: <Link href="/optout" className="font-semibold text-navy underline">stop mail to your home</Link>.</p>
    </LegalView>
  );
}
