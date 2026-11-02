import Link from "next/link";
import { PLANS, TRIAL } from "@216leads/shared";
import { Card, LinkButton } from "@/components/ui";

export const metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ annual?: string }> }) {
  const annual = (await searchParams).annual === "1";
  const toggle = (on: boolean, label: string) => (
    <Link href={on ? "/pricing?annual=1" : "/pricing"} aria-current={annual === on ? "page" : undefined}
      className={`focus-ring tap inline-flex items-center rounded-[8px] px-4 text-sm font-semibold ${annual === on ? "bg-navy text-white" : "text-slate"}`}>{label}</Link>
  );
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">Pricing</h1>
      <p className="mt-2 text-slate">{TRIAL.days}-day free trial, no card needed. Postcards beyond your monthly credits are $0.99 each.</p>
      <div className="mt-6 inline-flex rounded-[10px] border border-line bg-white p-1">{toggle(false, "Monthly")}{toggle(true, "Yearly (2 months free)")}</div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((p) => (
          <Card key={p.key} className={`flex flex-col p-6 ${p.key === "pro" ? "border-2 border-signal" : ""}`}>
            <h2 className="text-lg font-bold">{p.label}</h2>
            <div className="mt-2"><span className="num text-3xl font-extrabold">${(annual ? p.annual : p.monthly).toLocaleString("en-US")}</span><span className="text-slate">/{annual ? "year" : "month"}</span></div>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm">
              {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-won">✓</span>{f}</li>)}
            </ul>
            <LinkButton href="/signup" className="mt-6" variant={p.key === "pro" ? "primary" : "secondary"}>Start free trial</LinkButton>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate">If you don&apos;t book a job from 216 Leads in your first 60 days, we refund month 2. <Link href="/refunds" className="underline">Refunds</Link></p>
    </section>
  );
}
