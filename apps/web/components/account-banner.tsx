import Link from "next/link";
import type { OrgRow } from "@/lib/session";

/** Trial countdown and payment-failed grace banner (spec 11). */
export function AccountBanner({ org }: { org: OrgRow }) {
  if (org.payment_failed_at) {
    const graceEnds = new Date(Date.parse(org.payment_failed_at) + 7 * 86_400_000);
    return (
      <div role="alert" className="bg-lost px-4 py-2 text-center text-sm font-semibold text-white">
        Your last payment failed. Update your card by {graceEnds.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to keep your leads.{" "}
        <Link href="/settings/billing" className="underline">Fix billing</Link>
      </div>
    );
  }
  if (org.plan === "trial" && org.trial_ends_at) {
    const days = Math.max(0, Math.ceil((Date.parse(org.trial_ends_at) - Date.now()) / 86_400_000));
    return (
      <div className="bg-navy px-4 py-2 text-center text-sm text-white">
        {days > 0 ? `${days} day${days === 1 ? "" : "s"} left in your free trial.` : "Your free trial has ended."}{" "}
        <Link href="/settings/billing" className="font-semibold text-signal underline underline-offset-2">Pick a plan</Link>
      </div>
    );
  }
  if (org.plan === "canceled") {
    return (
      <div className="bg-slate px-4 py-2 text-center text-sm text-white">
        Your plan is canceled. <Link href="/settings/billing" className="font-semibold underline">Restart</Link>
      </div>
    );
  }
  return null;
}
