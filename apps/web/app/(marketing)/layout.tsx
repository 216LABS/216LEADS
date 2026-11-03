import Link from "next/link";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";
import { SiteFooter } from "@/components/site-footer";

// Public marketing site (spec 9.8): landing, pricing, sample, coverage, legal.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="focus-ring shrink-0 whitespace-nowrap" aria-label="216 HomeSignal home"><Logo /></Link>
          <nav aria-label="Site" className="flex items-center gap-1 text-sm">
            <Link href="/pricing" className="focus-ring tap hidden items-center rounded-full px-3 text-slate hover:text-navy sm:inline-flex">Pricing</Link>
            <Link href="/sample" className="focus-ring tap hidden items-center rounded-full px-3 text-slate hover:text-navy sm:inline-flex">Sample</Link>
            <Link href="/coverage" className="focus-ring tap hidden items-center rounded-full px-3 text-slate hover:text-navy sm:inline-flex">Coverage</Link>
            <Link href="/login" className="focus-ring tap inline-flex items-center whitespace-nowrap rounded-full px-3 text-slate hover:text-navy">Sign in</Link>
            {/* On phones the hero carries the trial button; the header stays one line. */}
            <span className="hidden sm:block"><LinkButton href="/signup" variant="navy" className="whitespace-nowrap">Start free trial</LinkButton></span>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
