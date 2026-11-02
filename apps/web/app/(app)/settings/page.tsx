import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

const SECTIONS = [
  { href: "/settings/recipe", title: "Scoring recipe", sub: "What makes a home a good lead for you, and every past version." },
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
