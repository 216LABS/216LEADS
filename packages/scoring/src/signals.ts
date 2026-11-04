// Signal library (spec 7.2). Attribute signals are computed here from the parcel row;
// event signals (last permit per category, open violations, neighbor jobs, flags) are
// materialized in parcel_signal by the `signals` job and passed in.
import { CATEGORY_NOUN } from "./categories";
import { POS_CITIES } from "./generated";
import type { Evidence, Profile, ScoreInput, TemplateSignal } from "./types";

export interface Resolved {
  v: number;
  label: string;
  evidence: Evidence;
}

/** Default lifespan when a template does not set one. */
const DEFAULT_LIFESPAN = 25;
const NO_RECENT_YEARS = 15;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n)}%`;
const year = (iso: string) => iso.slice(0, 4);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

function ago(iso: string, today: string): string {
  const d = daysBetween(iso, today);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} yrs ago`;
}

function titleCity(c: string) {
  return c.toLowerCase().replace(/\b[a-z]/g, (x) => x.toUpperCase());
}

/** Survey answer -> 0..1 (Poor 1, Fair 0.6, Good 0). Unknown text -> null. */
export function surveyValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^(poor|bad|very poor|deteriorated|yes|y|true|unsafe|d|f)$/.test(s)) return 1;
  if (/^(fair|average|c)$/.test(s)) return 0.6;
  if (/^(good|very good|excellent|new|no|n|false|a|b|none)$/.test(s)) return 0;
  return null;
}

const SURVEY_PART_LABEL: Record<string, string> = {
  roof: "Roof", gutters: "Gutters", siding: "Siding", windows: "Windows", porch: "Porch", chimney: "Chimney",
  driveway: "Driveway", garage: "Garage", paint_peeling: "Peeling paint", grade: "Overall condition",
};

/**
 * Resolve one template signal for a parcel. Returns null when the data needed is not
 * available for this home (the signal is then left out of the score, not counted as 0).
 */
/** Days after a sale that `pos_city_sale` counts (issue #11). */
export const POS_SALE_DAYS = 90;

const POS_BY_MUNI = new Map(POS_CITIES.map((c) => [c.municipality, c]));

/** The point-of-sale city for a municipality name from our parcel data, or null. */
export function posCity(municipality: string | null | undefined) {
  return municipality ? POS_BY_MUNI.get(municipality.toUpperCase()) ?? null : null;
}

export function resolveSignal(key: string, ts: TemplateSignal, input: ScoreInput, profile: Profile): Resolved | null {
  const p = input.parcel;
  const today = input.today;
  const thisYear = Number(today.slice(0, 4));
  const rec = input.parcelRecordUrl ? { url: input.parcelRecordUrl } : {};
  const [base, arg] = key.split(":") as [string, string | undefined];

  switch (base) {
    case "new_owner": {
      if (!p.last_sale_date || (p.last_sale_price ?? 0) < 10_000) return { v: 0, label: "", evidence: {} };
      const d = daysBetween(p.last_sale_date, today);
      const v = d <= 30 ? 1 : clamp01((365 - d) / (365 - 30));
      const sale = input.recentEvents.find((e) => e.kind === "sale" && e.event_date === p.last_sale_date);
      return {
        v,
        label: `Sold ${ago(p.last_sale_date, today)} for ${money(p.last_sale_price ?? 0)}`,
        evidence: { date: p.last_sale_date, value: p.last_sale_price ?? undefined, event_id: sale?.id, ...rec },
      };
    }
    case "home_age": {
      if (!p.year_built) return null;
      const age = thisYear - p.year_built;
      return { v: clamp01(age / 100), label: `Built ${p.year_built} (${age} yrs old)`, evidence: { value: p.year_built, ...rec } };
    }
    case "era_pre1950": {
      if (!p.year_built) return null;
      return { v: p.year_built < 1950 ? 1 : 0, label: "Pre-1950 construction", evidence: { value: p.year_built, ...rec } };
    }
    case "last_permit_age": {
      const cat = arg ?? "";
      const noun = CATEGORY_NOUN[cat] ?? cat;
      const life = ts.lifespan_years ?? DEFAULT_LIFESPAN;
      const s = input.signals[`last_permit:${cat}`];
      if (s && s.evidence.date) {
        const yrs = thisYear - Number(year(s.evidence.date));
        return {
          v: clamp01(yrs / life),
          label: yrs <= 0 ? `New ${noun} permit this year` : `Last ${noun} permit ${year(s.evidence.date)} (${yrs} yrs ago)`,
          evidence: s.evidence,
        };
      }
      if (!p.year_built) return null;
      const age = thisYear - p.year_built;
      // No permit on file: estimate from the home's age (spec 7.2 "if none, use home age").
      const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
      const est = age >= life ? `${Noun} likely past its ${life}-yr life` : `${Noun} could be ${age} yrs old`;
      return {
        v: clamp01(age / life),
        label: input.coverage.permits ? est : `${est} (no ${titleCity(p.city)} permit records online)`,
        evidence: { value: p.year_built, ...rec },
      };
    }
    case "no_recent_permit": {
      if (!input.coverage.permits) return null;
      const cat = arg ?? "";
      const noun = CATEGORY_NOUN[cat] ?? cat;
      const s = input.signals[`last_permit:${cat}`];
      const cutoff = thisYear - NO_RECENT_YEARS;
      if (s && s.evidence.date && Number(year(s.evidence.date)) >= cutoff) {
        return { v: 0, label: "", evidence: s.evidence };
      }
      const since = Math.max(cutoff, input.coverage.permits_since ?? cutoff);
      return { v: 1, label: `No ${noun} permit on record since ${since}`, evidence: { ...rec } };
    }
    case "canopy": {
      if (p.canopy_pct === null || p.canopy_pct === undefined) return null;
      return { v: clamp01(p.canopy_pct / 60), label: `${pct(p.canopy_pct)} tree canopy over the lot`, evidence: { value: p.canopy_pct, source: "ccpc_2019", url: input.urls?.canopy ?? undefined } };
    }
    case "grass": {
      if (p.grass_pct === null || p.grass_pct === undefined) return null;
      return { v: clamp01(p.grass_pct / 60), label: `${pct(p.grass_pct)} of the lot is lawn`, evidence: { value: p.grass_pct, source: "ccpc_2019", url: input.urls?.canopy ?? undefined } };
    }
    case "lot_size": {
      const r = input.derived.lot_pct;
      if (r === null || r === undefined || !p.lot_acres) return null;
      const top = Math.max(1, Math.round((1 - r) * 100));
      return { v: clamp01(r), label: `${p.lot_acres.toFixed(2)} acre lot (top ${top}% in your area)`, evidence: { value: p.lot_acres, ...rec } };
    }
    case "living_area": {
      const r = input.derived.living_pct;
      if (r === null || r === undefined || !p.living_sqft) return null;
      return {
        v: clamp01(r),
        label: `${p.living_sqft.toLocaleString("en-US")} sq ft (bigger than ${Math.round(r * 100)}% nearby)`,
        evidence: { value: p.living_sqft, ...rec },
      };
    }
    case "pos_city_sale": {
      // Issue #11: a sale in the last 90 days in a town with a point-of-sale inspection (the
      // inspection tends to flag roof, masonry, electrical, plumbing, gutters and driveways).
      const city = posCity(input.municipality);
      // Outside a POS town the rule doesn't apply: leave the signal out (no prior is kept for it),
      // so adding it to a template doesn't lower anyone else's score.
      if (!city) return null;
      if (!p.last_sale_date || (p.last_sale_price ?? 0) < 10_000) return { v: 0, label: "", evidence: {} };
      const d = daysBetween(p.last_sale_date, today);
      if (d < 0 || d > POS_SALE_DAYS) return { v: 0, label: "", evidence: {} };
      const sale = input.recentEvents.find((e) => e.kind === "sale" && e.event_date === p.last_sale_date);
      return {
        v: 1,
        label: `Sold in ${city.name}, which requires a point-of-sale inspection`,
        evidence: { date: p.last_sale_date, value: p.last_sale_price ?? undefined, event_id: sale?.id, source: "acar_pos_2025", ...rec },
      };
    }
    case "price_band": {
      const value = p.market_value ?? p.last_sale_price;
      if (!value) return null;
      const lo = profile.filters.price_min ?? null;
      const hi = profile.filters.price_max ?? null;
      const inside = (lo === null || value >= lo) && (hi === null || value <= hi);
      const near = (lo === null || value >= lo * 0.8) && (hi === null || value <= hi * 1.2);
      // Issue #72: say where the number comes from (the county's value, not a sale), and only claim
      // "in your range" when it is.
      const what = p.market_value ? `County value ${money(value)}` : `Last sold for ${money(value)}`;
      const label = inside ? `${what}, in your range` : near ? `${what}, just outside your range` : what;
      return { v: inside ? 1 : near ? 0.5 : 0, label, evidence: { value, ...rec } };
    }
    case "no_gas": {
      if (p.gas_service === null) return null;
      return { v: p.gas_service ? 0 : 1, label: "No gas line: electric, oil or propane heat", evidence: { ...rec } };
    }
    case "well_water": {
      if (!p.water_source) return null;
      return { v: p.water_source === "PVT" ? 1 : 0, label: "Private well water", evidence: { ...rec } };
    }
    case "septic": {
      if (!p.sewer_type) return null;
      return { v: p.sewer_type === "SP" || p.sewer_type === "SPS" ? 1 : 0, label: "Septic or private sewer", evidence: { ...rec } };
    }
    case "flood": {
      if (p.in_sfha === null && !p.flood_zone) return null;
      if (p.in_sfha) return { v: 1, label: `In FEMA flood zone ${p.flood_zone ?? ""}`.trim(), evidence: { value: p.flood_zone ?? "", source: "fema_nfhl", url: input.urls?.flood ?? undefined } };
      const shaded = (p.flood_zone ?? "").toUpperCase().includes("0.2");
      return { v: shaded ? 0.5 : 0, label: "In FEMA 0.2% annual-chance flood area", evidence: { value: p.flood_zone ?? "", source: "fema_nfhl", url: input.urls?.flood ?? undefined } };
    }
    case "owner_occupied": {
      if (p.owner_occupied_guess === null) return null;
      return { v: p.owner_occupied_guess ? 1 : 0, label: "Owner lives here", evidence: { ...rec } };
    }
    case "garage": {
      if (p.garage_type === null) return { v: 0, label: "", evidence: {} };
      const g = p.garage_type.toUpperCase();
      return { v: /ATTACHED|BUILT-IN|BASEMENT/.test(g) && !/DETACHED/.test(g) ? 1 : 0.6, label: `${titleCity(g)} garage, good fit for an EV charger`, evidence: { value: g, ...rec } };
    }
    case "condo":
      return { v: p.is_condo ? 1 : 0, label: "Condo", evidence: {} };
    case "active_violation": {
      if (!input.coverage.violations) return null;
      const s = input.signals[key];
      if (!s) return { v: 0, label: "", evidence: {} };
      const noun = CATEGORY_NOUN[arg ?? ""] ?? arg;
      // Say what the city found when we have it; the separate Fix list screen is gone, so this is where it shows.
      const when = s.evidence.date ? `cited ${s.evidence.date}` : "cited this year";
      const label = s.evidence.finding ? `City ${noun} citation, ${when}: ${s.evidence.finding}` : `Open city ${noun} citation (${s.evidence.date ?? "this year"})`;
      return { v: clamp01(s.value), label, evidence: s.evidence };
    }
    case "neighbor_job": {
      if (!input.coverage.permits) return null;
      const s = input.signals[key];
      if (!s) return { v: 0, label: "", evidence: {} };
      const noun = CATEGORY_NOUN[arg ?? ""] ?? arg;
      const n = s.evidence.count ?? 2;
      return { v: clamp01(s.value), label: `${n} neighbors pulled ${noun} permits in the last 60 days`, evidence: s.evidence };
    }
    case "survey_condition": {
      if (!p.survey_2022) return null;
      const part = arg ?? "";
      const raw = p.survey_2022[part];
      const v = surveyValue(raw);
      if (v === null) return null;
      const label = `${SURVEY_PART_LABEL[part] ?? part} rated ${raw} (2022 city survey)`;
      return { v, label, evidence: { value: raw ?? "", date: "2022", source: "cle_survey", url: input.urls?.survey ?? undefined } };
    }
    default:
      return null;
  }
}

export { titleCity, ago, daysBetween };
