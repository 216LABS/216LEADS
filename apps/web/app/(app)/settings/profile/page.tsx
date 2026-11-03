import { getDirectSql, getSql } from "@216leads/db";
import { activeRecipe, ensurePresetVersion, orgZips } from "@216leads/ingest";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { ProfileEditor } from "./profile-editor";

export const metadata = { title: "Homes you want" };
export const dynamic = "force-dynamic";

// Spec 9.7 Profile: the perfect-customer controls and "what matters most" sliders on the active
// recipe. Saving makes a new recipe version (source "slider") and re-scores.
export default async function ProfilePage() {
  const { org } = await requireOrg();
  await ensurePresetVersion(getDirectSql(), org.id, org.trade);
  const sql = getSql();
  const [active, zips] = await Promise.all([activeRecipe(sql, org.id), orgZips(sql, org.id)]);
  if (!active) notFound();
  return (
    <>
      <SettingsHeader title="Homes you want" sub="Changes show a new count before you save. Every save is kept; revert any time under How we score." />
      <ProfileEditor recipe={active.recipe} multipliers={active.multipliers} versionId={active.id} zips={zips} />
    </>
  );
}
