import { getSql } from "@216leads/db";
import { orgExclusiveZips, orgZips } from "@216leads/ingest";
import { planLimits, tradeLabel } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { AreaEditor } from "./area-editor";

export const metadata = { title: "Your area" };
export const dynamic = "force-dynamic";

export default async function TerritoriesPage() {
  const { org, role } = await requireOrg();
  const sql = getSql();
  const [zips, exclusive] = await Promise.all([orgZips(sql, org.id), orgExclusiveZips(sql, org.id)]);
  const limits = planLimits(org.plan);
  return (
    <>
      <SettingsHeader title="Your area" sub="Add or remove ZIP codes and towns. Your leads are re-scored when you save." />
      <AreaEditor zips={zips} exclusive={exclusive} exclusiveMax={org.plan === "exclusive" ? limits.exclusiveZips : 0}
        trade={org.trade} tradeLabel={tradeLabel(org.trade).toLowerCase()} canEdit={role === "owner"} max={limits.maxZips} />
    </>
  );
}
