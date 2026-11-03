import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/session";
import { Logo } from "@/components/logo";
import { BrandForm } from "./brand-form";

export const metadata = { title: "Your brand" };

// Spec 9.1 step 4, after the org exists: logo, phone, website, default offer.
export default async function BrandPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  const { org } = ctx;
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-title font-semibold">Your brand</h1>
      <p className="mb-6 mt-2 text-slate">This goes on your postcards. You can skip it and add it later in Settings.</p>
      <BrandForm org={{ name: org.name, phone: org.phone, website: org.website, default_offer: org.default_offer, has_logo: !!org.logo_path }} />
    </main>
  );
}
