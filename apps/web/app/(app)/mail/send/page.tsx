import { getSql } from "@216leads/db";
import { templatesFor } from "@216leads/ingest";
import { requireOrg } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { SendScreen } from "./send-screen";

export const metadata = { title: "Send postcards" };
export const dynamic = "force-dynamic";

// Send screen (spec 9.5): N homes, M removed by checks, cost, delivery window, 15-minute undo.
export default async function SendPage({ searchParams }: { searchParams: Promise<{ leads?: string; parcels?: string; from?: string }> }) {
  const { org } = await requireOrg();
  const sp = await searchParams;
  const leadIds = (sp.leads ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  const parcelKeys = (sp.parcels ?? "").split(",").filter(Boolean).slice(0, 500);
  const templates = await templatesFor(getSql(), org.id, org.trade);
  return (
    <>
      <PageHeader title="Send postcards" />
      <SendScreen leadIds={leadIds} parcelKeys={parcelKeys} fromMap={sp.from === "map"}
        templates={templates.map((t) => ({ id: t.id, name: t.name, system: t.org_id === null, merge: t.merge_defaults as never }))} />
    </>
  );
}
