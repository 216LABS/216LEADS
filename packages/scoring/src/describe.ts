// Plain-English names for recipe parts, for Settings and the wizard's confirm screen.
import { CATEGORY_NOUN } from "./categories";

const PLAIN: Record<string, string> = {
  new_owner: "Just moved in",
  home_age: "Older homes",
  era_pre1950: "Built before 1950",
  price_band: "Home value in your range",
  lot_size: "Bigger lots",
  canopy: "Tree cover",
  grass: "Lawn area",
  living_area: "Bigger homes",
  no_gas: "No gas line",
  well_water: "Private well",
  septic: "Septic system",
  flood: "Flood zone",
  owner_occupied: "Owner lives there",
  condo: "Condo",
  garage: "Has a garage",
  pos_city_sale: "Just sold in a point-of-sale inspection city",
};

const PART: Record<string, string> = {
  roof: "roof", gutters: "gutters", siding: "siding", windows: "windows", porch: "porch", chimney: "chimney",
  driveway: "driveway", garage: "garage", paint_peeling: "peeling paint", grade: "overall condition",
};

export function signalLabel(key: string): string {
  if (PLAIN[key]) return PLAIN[key]!;
  const [base, arg = ""] = key.split(":");
  const noun = CATEGORY_NOUN[arg] ?? arg.replace(/_/g, " ");
  switch (base) {
    case "last_permit_age": return `Age of last ${noun} work`;
    case "no_recent_permit": return `No ${noun} permit in 15 years`;
    case "active_violation": return `Open city ${noun} citation`;
    case "neighbor_job": return `Neighbors doing ${noun} work`;
    case "survey_condition": return `2022 survey: ${PART[arg] ?? arg} condition`;
    default: return key;
  }
}

export function triggerSentence(t: { kind: string; category?: string; within_days: number; label: string }): string {
  const noun = t.category ? CATEGORY_NOUN[t.category] ?? t.category : "";
  switch (t.kind) {
    case "sale": return `Sold in the last ${t.within_days} days`;
    case "violation": return `City ${noun} citation in the last ${t.within_days} days`;
    case "neighbor_job": return `Neighbors pulled ${noun} permits in the last ${t.within_days} days`;
    case "permit": return `A ${noun} permit on the same home in the last ${t.within_days} days`;
    default: return t.label;
  }
}
