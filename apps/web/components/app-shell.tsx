"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, Mail, Map, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { withBase } from "@216leads/shared";
import { Logo } from "./logo";
import { ReportProblem } from "./report-problem";

const TABS = [
  { href: "/leads", label: "Leads", icon: Home },
  { href: "/map", label: "Map", icon: Map },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/roi", label: "ROI", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, orgName, trade, banner, isAdmin }: {
  children: ReactNode; orgName: string; trade: string; banner?: ReactNode; isAdmin?: boolean;
}) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-5 md:flex">
        <Link href="/leads" className="focus-ring mb-6 px-2">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                "focus-ring tap flex items-center gap-3 rounded-[10px] px-3 text-sm font-semibold",
                active(t.href) ? "bg-navy text-white" : "text-slate hover:bg-navy-50 hover:text-navy",
              )}
            >
              <t.icon className="h-5 w-5" aria-hidden />
              {t.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link href="/admin/jobs" className={clsx("focus-ring tap flex items-center gap-3 rounded-[10px] px-3 text-sm font-semibold", active("/admin") ? "bg-navy text-white" : "text-slate hover:bg-navy-50")}>
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="mt-auto px-3 text-xs text-slate">
          <div className="font-semibold text-navy">{orgName}</div>
          <div className="capitalize">{trade.replace("_", " ")}</div>
          <div className="mt-3 flex flex-col items-start gap-2">
            <ReportProblem />
            <form action={withBase("/auth/signout")} method="post">
              <button className="focus-ring underline underline-offset-2 hover:text-navy">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-8">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/leads" className="focus-ring">
            <Logo />
          </Link>
          <span className="flex max-w-[55%] items-center gap-3 text-xs font-semibold text-slate">
            <span className="truncate">{orgName}</span>
            <ReportProblem label="Help" className="focus-ring tap shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-navy" />
          </span>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={clsx("focus-ring flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active(t.href) ? "text-signal" : "text-slate")}
          >
            <t.icon className="h-5 w-5" aria-hidden />
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
