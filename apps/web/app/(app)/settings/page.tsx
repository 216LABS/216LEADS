import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

// Spec 9.7. Mail rules join this list with M8.
const SECTIONS = [
  { href: "/settings/profile", title: "Perfect customer", sub: "Home age, value, lot, heat, what to leave out, and what matters most." },
  { href: "/settings/recipe", title: "Scoring recipe", sub: "What makes a home a good lead for you, and every past version." },
  { href: "/settings/territories", title: "Your area", sub: "The ZIP codes and towns you work in." },
  { href: "/settings/customers", title: "Current customers", sub: "Upload a list of addresses to keep off your leads." },
  { href: "/settings/brand", title: "Brand", sub: "Logo, phone, website and default offer for postcards." },
  { href: "/settings/digest", title: "Digest and return address", sub: "Who gets the weekly email, which day, and where returned mail goes." },
  { href: "/settings/team", title: "Team", sub: "Invite people by email." },
  { href: "/settings/billing", title: "Billing", sub: "Your plan, postcard credits, card and invoices." },
  { href: "/settings/coverage", title: "Data coverage", sub: "Which public records we have for each town in your area, and how fresh." },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Card className="divide-y divide-line">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="focus-ring tap flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper">
            <span>
              <span className="block font-semibold">{s.title}</span>
              <span className="block text-sm text-slate">{s.sub}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate" aria-hidden />
          </Link>
        ))}
      </Card>
    </>
  );
}
