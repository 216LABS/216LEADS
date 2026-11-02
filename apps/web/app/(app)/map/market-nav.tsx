import clsx from "clsx";
import Link from "next/link";
import { EmptyState, LinkButton } from "@/components/ui";

/** Map | Competitors switch shared by the two market pages. */
export function MarketNav({ active }: { active: "map" | "competitors" }) {
  const tab = (key: "map" | "competitors", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={clsx(
        "focus-ring tap flex flex-1 items-center justify-center rounded-[8px] px-3 text-sm font-semibold md:flex-none",
        active === key ? "bg-navy text-white" : "text-slate hover:text-navy",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Market tools" className="mb-4 flex rounded-[10px] border border-line bg-white p-1 md:inline-flex">
      {tab("map", "/map", "Map")}
      {tab("competitors", "/map/competitors", "Competitors")}
    </nav>
  );
}

/** Starter plan: the map, neighbor ring and competitor tracker are Pro features (spec 11). */
export function MarketUpsell() {
  return (
    <EmptyState title="The map comes with Pro" action={<LinkButton href="/settings/billing">See plans</LinkButton>}>
      See your leads on a map with recent permits, sales, violations and flood zones, draw around a block to mail it,
      mail the homes around a finished job, and see which businesses are pulling permits in your area.
    </EmptyState>
  );
}
