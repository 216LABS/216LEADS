import { redirect } from "next/navigation";
import { getOrgContext, getUser } from "@/lib/session";
import { trackOnce } from "@/lib/events";
import { Logo } from "@/components/logo";
import { TEMPLATES } from "@216leads/scoring";
import { Wizard, type WizardPrefill } from "./wizard";

export const metadata = { title: "Set up" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ trade?: string; zips?: string; ref?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/onboarding");
  const ctx = await getOrgContext();
  if (ctx?.org.onboarded_at) redirect("/leads");
  // Every new account lands here right after sign-up; record it once.
  if (!ctx) await trackOnce("signup", { userId: user.id });
  const sp = await searchParams;
  const zips = [...new Set((sp.zips ?? "").match(/\d{5}/g) ?? [])];
  const prefill: WizardPrefill | null = sp.trade && TEMPLATES[sp.trade] && sp.trade !== "new_movers"
    ? { trade: sp.trade, zips, ref: sp.ref && /^[A-Za-z0-9_-]{16,40}$/.test(sp.ref) ? sp.ref : null }
    : null;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-bold">Set up your account</h1>
      <p className="mb-6 mt-2 text-slate">Tell us about your business in plain words. We&rsquo;ll turn it into a ranked list of homes, each with the public records behind it.</p>
      <Wizard prefill={prefill} />
    </div>
  );
}
