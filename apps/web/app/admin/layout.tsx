import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { appEnv } from "@216leads/shared";
import { isAdmin, requireOrg } from "@/lib/session";
import { LEGAL_PAGES, legalDoc } from "@/lib/content";

const TABS = [
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/unmatched", label: "Unmatched" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/orgs", label: "Orgs" },
  { href: "/admin/suppression", label: "Suppression" },
  { href: "/admin/outbox", label: "Outbox" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg();
  if (!isAdmin(user.email)) notFound();
  // Issue #3: production must not run on draft legal text.
  const drafts = appEnv() === "production" ? LEGAL_PAGES.filter((p) => legalDoc(p).status === "draft") : [];
  return (
    <AppShell orgName={org.name} trade={org.trade} isAdmin>
      <nav className="mb-5 flex gap-2 overflow-x-auto" aria-label="Admin">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="focus-ring tap inline-flex items-center rounded-full border border-line bg-white px-4 text-sm font-semibold hover:border-navy/30">
            {t.label}
          </Link>
        ))}
      </nav>
      {drafts.length ? (
        <p role="alert" className="mb-5 rounded-[10px] border border-lost bg-lost-50 px-4 py-2 text-sm font-semibold text-lost">
          Draft legal pages are live in production: {drafts.join(", ")}. Replace them with reviewed text in content/legal.
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
