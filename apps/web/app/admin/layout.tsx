import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isAdmin, requireOrg } from "@/lib/session";

const TABS = [
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/unmatched", label: "Unmatched" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/orgs", label: "Orgs" },
  { href: "/admin/suppression", label: "Suppression" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await requireOrg();
  if (!isAdmin(user.email)) notFound();
  return (
    <AppShell orgName={org.name} trade={org.trade} isAdmin>
      <nav className="mb-5 flex gap-2 overflow-x-auto" aria-label="Admin">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="focus-ring tap inline-flex items-center rounded-full border border-line bg-white px-4 text-sm font-semibold hover:border-navy/30">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
