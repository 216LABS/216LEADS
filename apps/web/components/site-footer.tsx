import Link from "next/link";
import { BRAND } from "@216leads/shared";

const LINKS: [string, string][] = [["Terms", "/terms"], ["Privacy", "/privacy"], ["Data", "/data"], ["Refunds", "/refunds"], ["Stop mail to your home", "/optout"]];

/** Legal links + company line (issue #3), on the marketing site and in the app. */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={compact ? "mt-10 border-t border-line pt-4 text-xs text-slate" : "border-t border-line bg-white px-4 py-8 text-sm text-slate"}>
      <div className={compact ? "" : "mx-auto max-w-5xl"}>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.map(([label, href]) => <Link key={href} href={href} prefetch={false} className="focus-ring hover:text-navy hover:underline">{label}</Link>)}
        </nav>
        <p className="mt-2">{BRAND.footerAddress} · <a href={`mailto:${BRAND.supportEmail}`} className="hover:underline">{BRAND.supportEmail}</a></p>
        {compact ? null : <p className="mt-2 max-w-2xl text-xs">{BRAND.disclaimer}</p>}
      </div>
    </footer>
  );
}
