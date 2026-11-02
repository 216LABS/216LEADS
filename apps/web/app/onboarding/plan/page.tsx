import { redirect } from "next/navigation";
import { PLANS, TRIAL } from "@216leads/shared";
import { getOrgContext } from "@/lib/session";
import { Logo } from "@/components/logo";
import { Card, LinkButton } from "@/components/ui";

export const metadata = { title: "Your plan" };

// Spec 9.1 step 5: three plan cards; the trial starts with no card. Checkout comes in M7.
export default async function PlanPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-bold">Your plan</h1>
      <p className="mb-6 mt-2 text-slate">
        Your {TRIAL.days}-day free trial has started, with no card needed. Pick a plan any time before it ends.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.values(PLANS).map((p) => (
          <Card key={p.key} className="flex flex-col p-5">
            <h2 className="font-bold">{p.label}</h2>
            <p className="mt-1"><span className="num text-2xl font-bold">${p.monthly}</span><span className="text-sm text-slate">/mo</span></p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-slate">{p.features.map((f) => <li key={f}>• {f}</li>)}</ul>
          </Card>
        ))}
      </div>
      <LinkButton href="/leads" className="mt-6 w-full">Start my free trial</LinkButton>
    </div>
  );
}
