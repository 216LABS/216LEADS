"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, Mail, Map, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND, tradeLabel, withBase } from "@216leads/shared";
import { Logo } from "./logo";
import { ReportProblem } from "./report-problem";
import { SiteFooter } from "./site-footer";
import { buttonClass, LinkButton } from "./ui";

function LockPanel({ kind }: { kind: "locked" | "canceled" }) {
  return (
    <div className="card mx-auto max-w-lg p-6 text-center" role="alert">
      <h1 className="text-lg font-semibold">{kind === "canceled" ? "Your plan ended" : "Your trial ended"}</h1>
      <p className="mt-2 text-slate">
        Pick a plan to keep getting homes. Your leads, notes and history are all still here.
      </p>
      <LinkButton href="/settings/billing" className="mt-5">See plans</LinkButton>
      <p className="mt-4 text-sm text-slate">Questions? Email <a href={`mailto:${BRAND.supportEmail}`} className="underline">{BRAND.supportEmail}</a>.</p>
    </div>
  );
}

const TABS = [
  { href: "/leads", label: "Leads", icon: Home },
  { href: "/map", label: "Map", icon: Map },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/roi", label: "Results", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, orgName, trade, banner, isAdmin, locked }: {
  children: ReactNode; orgName: string; trade: string; banner?: ReactNode; isAdmin?: boolean;
  /** Trial over, grace over or plan ended (issue #4): only Billing stays open. */
  locked?: "locked" | "canceled" | null;
}) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    // --app-header-h: the phone header's height, so sticky bars below it line up (issue #59).
    <div className="min-h-dvh [--app-header-h:56px] md:flex md:[--app-header-h:0px]">
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
                "focus-ring tap flex items-center gap-3 rounded-[6px] border-l-2 px-3 text-sm",
                active(t.href) ? "border-navy bg-navy-50 font-semibold text-navy" : "border-transparent text-slate hover:bg-navy-50 hover:text-navy",
              )}
            >
              <t.icon className="h-5 w-5" aria-hidden />
              {t.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link href="/admin/metrics" className={clsx("focus-ring tap flex items-center gap-3 rounded-[6px] border-l-2 px-3 text-sm", active("/admin") ? "border-navy bg-navy-50 font-semibold text-navy" : "border-transparent text-slate hover:bg-navy-50")}>
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="mt-auto px-3 text-xs text-slate">
          <div className="font-semibold text-navy">{orgName}</div>
          <div>{tradeLabel(trade)}</div>
          <div className="mt-3 flex flex-col items-start gap-2">
            <Link href="/help" className="focus-ring hover:text-navy hover:underline">Help</Link>
            <ReportProblem className="focus-ring hover:text-navy hover:underline" />
            <form action={withBase("/auth/signout")} method="post">
              <button className="focus-ring hover:text-navy hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-8">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur md:hidden">
          <Link href="/leads" className="focus-ring">
            <Logo />
          </Link>
          <span className="flex max-w-[55%] items-center gap-2 text-xs text-slate">
            <span className="truncate">{orgName}</span>
            <Link href="/help" className={buttonClass("ghost", "shrink-0 px-2 text-xs")}>Help</Link>
          </span>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
          {locked && !path.startsWith("/settings/billing") && !path.startsWith("/help") ? <LockPanel kind={locked} /> : children}
          <SiteFooter compact />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={clsx("focus-ring flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active(t.href) ? "text-signal-600" : "text-slate")}
          >
            <t.icon className="h-5 w-5" aria-hidden />
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
