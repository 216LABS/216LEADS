import { getSql } from "@216leads/db";
import { planLimits } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { foundingSpotsLeft, stripe } from "@/lib/stripe";
import { SettingsHeader } from "@/components/settings-bits";
import { PlanCards } from "@/components/plan-cards";
import { Card } from "@/components/ui";
import { PortalButton } from "./portal-button";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const STATE_TEXT: Record<string, string> = {
  trialing: "Free trial", active: "Active", past_due: "Payment failed: update your card", locked: "Locked: pick a plan to keep going", canceled: "Canceled",
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }) : null);

// Settings → Billing (spec 9.7): plan, state, credits, Checkout and the Stripe portal.
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { org, role } = await requireOrg();
  const { done } = await searchParams;
  const limits = planLimits(org.plan);
  const [zips] = await getSql()<{ n: number }[]>`select count(*)::int as n from territory where org_id = ${org.id} and kind = 'zip'`;
  const billingOn = !!stripe();
  const foundingLeft = billingOn ? await foundingSpotsLeft() : 0;
  const paid = ["starter", "pro", "exclusive"].includes(org.plan);
  return (
    <>
      <SettingsHeader title="Billing" />
      {done ? <p role="status" className="mb-4 rounded-[10px] bg-won-50 px-3 py-2 text-sm font-semibold text-won">Thanks! Your plan updates in a few seconds.</p> : null}
      <Card className="mb-4 grid gap-3 p-5 text-sm sm:grid-cols-4">
        <div><div className="text-xs text-slate">Plan</div><div className="font-semibold">{limits.label}{org.plan_interval === "year" ? " (yearly)" : ""}{org.founding_member ? " · founding member" : ""}</div></div>
        <div><div className="text-xs text-slate">Status</div><div className="font-semibold">{STATE_TEXT[org.billing_state]}</div></div>
        <div>
          <div className="text-xs text-slate">{org.billing_state === "trialing" ? "Trial ends" : "Renews or ends"}</div>
          <div className="font-semibold">{day(org.billing_state === "trialing" ? org.trial_ends_at : org.period_end) ?? "–"}</div>
        </div>
        <div><div className="text-xs text-slate">Postcard credits · ZIPs</div><div className="font-semibold">{org.postcard_credits} · {zips?.n ?? 0} of {limits.maxZips}</div></div>
      </Card>
      {paid && role === "owner" ? <div className="mb-4"><PortalButton /></div> : null}
      <PlanCards current={paid ? org.plan : ""} foundingLeft={foundingLeft} canBuy={role === "owner"} billingOn={billingOn} />
      {role !== "owner" ? <p className="mt-3 text-sm text-slate">Only the account owner can change the plan.</p> : null}
    </>
  );
}
