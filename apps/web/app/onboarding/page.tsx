import { redirect } from "next/navigation";
import { getOrgContext, getUser } from "@/lib/session";
import { trackOnce } from "@/lib/events";
import { Logo } from "@/components/logo";

export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/onboarding");
  const ctx = await getOrgContext();
  if (ctx?.org.onboarded_at) redirect("/leads");
  // Every new account lands here right after sign-up; record it once.
  if (!ctx) await trackOnce("signup", { userId: user.id });
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-bold">Set up your account</h1>
      <p className="mt-2 text-slate">The setup wizard is coming in the next milestone.</p>
    </div>
  );
}
