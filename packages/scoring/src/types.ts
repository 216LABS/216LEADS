export interface TemplateSignal {
  weight: number;
  lifespan_years?: number;
}

/** `permit` = an adjacent permit on the same home (Addendum A5); `neighbor_job` = nearby homes. */
export type TriggerKind = "sale" | "neighbor_job" | "violation" | "permit" | "manual";

export interface TriggerDef {
  kind: TriggerKind;
  category?: string;
  within_days: number;
  boost: number;
  label: string;
}

export interface Filters {
  year_built_max?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  lot_acres_min?: number | null;
  canopy_min?: number | null;
  gas?: "any" | "gas" | "no_gas";
  owner_occupied?: boolean;
  zips?: string[];
  sewer_in?: string[];
}

export interface Exclusions {
  rentals?: boolean;
  condos?: boolean;
  condemned?: boolean;
  tax_delinquent?: boolean;
  streets?: string[];
  parcel_keys?: string[];
}

export interface Template {
  key: string;
  version: number;
  label: string;
  threshold: number;
  signals: Record<string, TemplateSignal>;
  triggers: TriggerDef[];
  sliders: { key: string; label: string }[];
  default_filters: Filters;
  default_exclusions: Exclusions;
  pitch: string;
}

export interface Profile {
  weights: Record<string, number>;
  filters: Filters;
  exclusions: Exclusions;
  learned_weights: Record<string, number>;
}

/** The parcel columns scoring reads. Never includes owner data (there is none to include). */
export interface ParcelFacts {
  parcel_key: string;
  addr_line: string;
  city: string;
  zip: string;
  land_use_code: string | null;
  year_built: number | null;
  living_sqft: number | null;
  lot_acres: number | null;
  style: string | null;
  garage_type: string | null;
  gas_service: boolean | null;
  water_source: string | null;
  sewer_type: string | null;
  market_value: number | null;
  last_sale_date: string | null;
  last_sale_price: number | null;
  owner_occupied_guess: boolean | null;
  is_rental: boolean;
  is_condo: boolean;
  tax_delinquent: boolean | null;
  canopy_pct: number | null;
  grass_pct: number | null;
  flood_zone: string | null;
  in_sfha: boolean | null;
  survey_2022: Record<string, string | null> | null;
  data_limited?: boolean;
}

export interface Evidence {
  event_id?: number;
  date?: string;
  url?: string;
  value?: number | string;
  years?: number;
  count?: number;
  contractor?: string | null;
  source?: string;
}

/** A row of parcel_signal. */
export interface MaterializedSignal {
  value: number;
  evidence: Evidence;
}

/** Which public datasets cover this parcel's town. Missing coverage = signal unknown, not zero. */
export interface Coverage {
  permits: boolean;
  /** First year of permit data for this town (e.g. 2015 for Cleveland). */
  permits_since?: number;
  violations: boolean;
}

export interface RecentEvent {
  id: number;
  kind: string;
  category: string | null;
  event_date: string;
  source_url: string | null;
  amount: number | null;
  arms_length: boolean | null;
  is_active: boolean | null;
}

export interface ScoreInput {
  parcel: ParcelFacts;
  signals: Record<string, MaterializedSignal>;
  coverage: Coverage;
  /** Percentile ranks (0..1) within the org's territory. */
  derived: { lot_pct?: number | null; living_pct?: number | null };
  /** Sales, violations and permits at this home in the last 120 days. */
  recentEvents: RecentEvent[];
  /** Active condemnation / demolition / boardup at this home. */
  flags?: { condemned?: boolean; demolished?: boolean; boarded?: boolean };
  /** Evidence URL for facts that come from the parcel record itself. */
  parcelRecordUrl?: string | null;
  /** Evidence URLs for the 2022 city survey and county canopy rows of this home. */
  urls?: { survey?: string | null; canopy?: string | null; flood?: string | null };
  /**
   * Population averages per signal key. Used when this home has no data for a signal
   * (e.g. its town publishes no permits), so missing data neither inflates nor sinks a score.
   */
  priors?: Record<string, number>;
  /** Town the home is in, as named in our parcel data (e.g. "SHAKER HEIGHTS"), for town-level rules. */
  municipality?: string | null;
  /** YYYY-MM-DD in America/New_York. */
  today: string;
}

export interface Reason {
  key: string;
  label: string;
  points: number;
  evidence: Evidence;
}

export interface FiredTrigger {
  kind: TriggerKind;
  label: string;
  boost: number;
  date: string;
  event_id?: number;
}

export interface ScoreResult {
  score: number;
  reasons: Reason[];
  pitch: string;
  trigger: FiredTrigger | null;
  qualifies: boolean;
}

export type FilterResult = { ok: true } | { ok: false; reason: string };
