import { getSql } from "@216leads/db";
import { orgZips } from "@216leads/ingest";
import { planLimits, tradeLabel } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { AreaEditor } from "./area-editor";

export const metadata = { title: "Your area" };
export const dynamic = "force-dynamic";

export default async function TerritoriesPage() {
  const { org, role } = await requireOrg();
  const zips = await orgZips(getSql(), org.id);
  return (
    <>
      <SettingsHeader title="Your area" sub="Add or remove ZIP codes and towns. Your leads are re-scored when you save." />
      <AreaEditor zips={zips} trade={org.trade} tradeLabel={tradeLabel(org.trade).toLowerCase()} canEdit={role === "owner"} max={planLimits(org.plan).maxZips} />
    </>
  );
}
