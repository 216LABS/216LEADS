import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { BrandForm } from "@/app/onboarding/brand/brand-form";

export const metadata = { title: "Brand" };

export default async function BrandSettingsPage() {
  const { org } = await requireOrg();
  return (
    <>
      <SettingsHeader title="Brand" sub="What goes on your postcards." />
      <BrandForm org={{ name: org.name, phone: org.phone, website: org.website, default_offer: org.default_offer, has_logo: !!org.logo_path }} inSettings />
    </>
  );
}
