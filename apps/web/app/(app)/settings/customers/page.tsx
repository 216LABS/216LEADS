import { getSql } from "@216leads/db";
import { requireOrg } from "@/lib/session";
import { SettingsHeader } from "@/components/settings-bits";
import { CustomerUpload } from "./customer-upload";

export const metadata = { title: "Current customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { org } = await requireOrg();
  const [c] = await getSql()<{ n: number; matched: number }[]>`
    select count(*)::int as n, count(parcel_key)::int as matched from org_suppression where org_id = ${org.id}`;
  return (
    <>
      <SettingsHeader title="Current customers" sub="Homes on this list never show up as leads or get your postcards." />
      <CustomerUpload saved={c?.n ?? 0} matched={c?.matched ?? 0} />
    </>
  );
}
