import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

// Spec 9.7, grouped (issue #59). Help lives in the main navigation, not here.
const GROUPS = [
  {
    title: "Your leads",
    rows: [
      { href: "/settings/profile", title: "Homes you want", sub: "Home age, value, lot, heat, what to leave out, and what matters most." },
      { href: "/settings/territories", title: "Your area", sub: "The ZIP codes and towns you work in." },
      { href: "/settings/recipe", title: "How we score", sub: "What makes a home a good lead for you, and every past version." },
      { href: "/settings/customers", title: "Current customers", sub: "Upload a list of addresses to keep off your leads." },
      { href: "/settings/coverage", title: "Data coverage", sub: "Which public records we have for each town in your area, and how fresh." },
    ],
  },
  {
    title: "Postcards",
    rows: [
      { href: "/settings/brand", title: "Brand", sub: "Logo, phone, website and default offer for postcards." },
      { href: "/settings/digest", title: "Digest and return address", sub: "Who gets the weekly email, which day, and where returned mail goes." },
    ],
  },
  {
    title: "Account",
    rows: [
      { href: "/settings/account", title: "Your account", sub: "Your email, password, and signing out." },
      { href: "/settings/team", title: "Team", sub: "Invite people by email." },
      { href: "/settings/billing", title: "Billing", sub: "Your plan, postcard credits, card and invoices." },
    ],
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="mb-2 text-sm font-semibold text-slate">{g.title}</h2>
            <Card className="divide-y divide-line">
              {g.rows.map((s) => (
                <Link key={s.href} href={s.href} className="focus-ring tap flex items-center justify-between gap-4 px-4 py-2 hover:bg-paper">
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="block text-sm text-slate">{s.sub}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate" aria-hidden />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
