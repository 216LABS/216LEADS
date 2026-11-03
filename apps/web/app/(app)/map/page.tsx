import { getSql } from "@216leads/db";
import { territoryExtent } from "@216leads/ingest";
import { CATEGORY_KEYS, CATEGORY_NOUN, TRADE_CATEGORY } from "@216leads/scoring";
import { planLimits } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { MarketNav, MarketUpsell } from "./market-nav";
import { MapView } from "./map-view";

export const metadata = { title: "Map" };
export const dynamic = "force-dynamic";

const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Map (spec 9.3): score-colored lead pins, record layers, lasso to mail, neighbor ring.
export default async function MapPage({ searchParams }: { searchParams: Promise<{ ring?: string }> }) {
  const { org } = await requireOrg();
  const sp = await searchParams;
  if (!planLimits(org.plan).marketTools) {
    return (
      <>
        <PageHeader title="Map" />
        <MarketUpsell />
      </>
    );
  }
  const sql = getSql();
  const extent = await territoryExtent(sql, org.id);
  // Issue #72: an area whose homes have no map position yet (Cuyahoga centroids load in their own
  // weekly job) is not the same as no area, so don't send people to add ZIPs they already have.
  const [area] = extent ? [{ n: 1 }] : await sql<{ n: number }[]>`select count(*)::int as n from territory where org_id = ${org.id}`;
  const categories = CATEGORY_KEYS.filter((k) => CATEGORY_NOUN[k]).map((k) => ({ key: k, label: CATEGORY_NOUN[k]! }));
  return (
    <>
      <PageHeader title="Map" sub="Tap a pin for the home. Draw around a block to mail it." />
      <MarketNav active="map" />
      {extent ? (
        <MapView
          styleUrl={process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE}
          extent={extent}
          categories={categories}
          tradeCategory={TRADE_CATEGORY[org.trade] ?? null}
          credits={org.postcard_credits}
          initialRing={sp.ring && /^[a-z]+:[\w-]{1,40}$/.test(sp.ring) ? sp.ring : null}
        />
      ) : area && area.n > 0 ? (
        <EmptyState title="Map not ready for your area yet">
          Your homes are loaded, but their map positions are still coming in from the county. Check back tomorrow. Your leads list works in the meantime.
        </EmptyState>
      ) : (
        <EmptyState title="No area yet" action={<LinkButton href="/settings/territories">Add your area</LinkButton>}>
          Add the ZIP codes you work in and your homes show up here.
        </EmptyState>
      )}
    </>
  );
}
