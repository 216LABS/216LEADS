import { redirect } from "next/navigation";
import { TRIAL } from "@216leads/shared";
import { getOrgContext } from "@/lib/session";
import { foundingSpotsLeft, stripe } from "@/lib/stripe";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";
import { PlanCards } from "@/components/plan-cards";

export const metadata = { title: "Your plan" };
export const dynamic = "force-dynamic";

// Spec 9.1 step 5: three plan cards; the trial starts with no card. Picking a plan now keeps the
// remaining trial days and adds 25 free postcards (spec 11).
export default async function PlanPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  const billingOn = !!stripe();
  const foundingLeft = billingOn ? await foundingSpotsLeft() : 0;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-bold">Your plan</h1>
      <p className="mb-6 mt-2 text-slate">
        Your {TRIAL.days}-day free trial has started, with no card needed. Add a plan now to keep your trial days and get {TRIAL.cardCredits} free postcards,
        or decide later.
      </p>
      <PlanCards current="" foundingLeft={foundingLeft} canBuy={ctx.role === "owner"} billingOn={billingOn} />
      <LinkButton href="/leads" variant="secondary" className="mt-6 w-full">Start my free trial</LinkButton>
    </div>
  );
}
