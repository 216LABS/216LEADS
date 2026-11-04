// Scoring engine (spec 7.1). Pure: no I/O, deterministic for the same input.
import { resolveSignal, daysBetween } from "./signals";
import type {
  FilterResult, FiredTrigger, Profile, Reason, ScoreInput, ScoreResult, Template,
} from "./types";

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const ALLOWED_MULTIPLIERS = [0, 0.5, 1, 1.5, 2];

function multiplier(profile: Profile, key: string): number {
  const m = profile.weights[key];
  if (m === undefined || m === null || !Number.isFinite(m)) return 1;
  // Snap to the allowed slider stops.
  return ALLOWED_MULTIPLIERS.reduce((best, s) => (Math.abs(s - m) < Math.abs(best - m) ? s : best), 1);
}

function learned(profile: Profile, key: string): number {
  const l = profile.learned_weights[key];
  return l === undefined || !Number.isFinite(l) ? 1 : clamp(l, 0.8, 1.25);
}

/** Merge template defaults with the org's saved profile. */
export function effectiveProfile(t: Template, saved?: Partial<Profile> | null): Profile {
  return {
    weights: { ...(saved?.weights ?? {}) },
    filters: { ...t.default_filters, ...(saved?.filters ?? {}) },
    exclusions: { ...t.default_exclusions, ...(saved?.exclusions ?? {}) },
    learned_weights: { ...(saved?.learned_weights ?? {}) },
  };
}

/** Hard filters and exclusions, applied before scoring. */
/** `t`, when given, lets a citation the trade scores override "owner-occupied only" (see below). */
export function passesFilters(input: ScoreInput, profile: Profile, t?: Template): FilterResult {
  const p = input.parcel;
  const f = profile.filters;
  const x = profile.exclusions;
  const flags = input.flags ?? {};

  if (flags.demolished) return { ok: false, reason: "demolished" };
  if (flags.boarded) return { ok: false, reason: "boarded" };
  if (x.condemned !== false && flags.condemned) return { ok: false, reason: "condemned" };
  if (x.rentals && p.is_rental) return { ok: false, reason: "rental" };
  if (x.condos && p.is_condo) return { ok: false, reason: "condo" };
  if (x.tax_delinquent && p.tax_delinquent) return { ok: false, reason: "tax_delinquent" };
  if (x.parcel_keys?.includes(p.parcel_key)) return { ok: false, reason: "excluded_home" };
  if (x.streets?.length) {
    const line = p.addr_line.toUpperCase();
    if (x.streets.some((s) => s.trim() && line.includes(s.trim().toUpperCase()))) return { ok: false, reason: "excluded_street" };
  }

  if (f.zips?.length && !f.zips.includes(p.zip)) return { ok: false, reason: "zip" };
  if (f.year_built_max && (!p.year_built || p.year_built > f.year_built_max)) return { ok: false, reason: "year_built" };
  const value = p.market_value ?? p.last_sale_price;
  if (f.price_min && (!value || value < f.price_min)) return { ok: false, reason: "price" };
  if (f.price_max && value && value > f.price_max) return { ok: false, reason: "price" };
  if (f.lot_acres_min && (!p.lot_acres || p.lot_acres < f.lot_acres_min)) return { ok: false, reason: "lot" };
  if (f.canopy_min && (p.canopy_pct === null || p.canopy_pct < f.canopy_min)) return { ok: false, reason: "canopy" };
  if (f.gas === "gas" && p.gas_service === false) return { ok: false, reason: "gas" };
  if (f.gas === "no_gas" && p.gas_service !== false) return { ok: false, reason: "gas" };
  // An open city citation in this trade overrides "owner-occupied only": a landlord told to fix the
  // heat (or wiring, gutters...) has to hire someone, which makes the home a better lead, not a worse one.
  const citedForTrade = Object.keys(input.signals).some((k) => k.startsWith("active_violation:") && (profile.weights[k] ?? t?.signals[k]?.weight ?? 0) > 0);
  if (f.owner_occupied && p.owner_occupied_guess === false && !citedForTrade) return { ok: false, reason: "not_owner_occupied" };
  if (f.sewer_in?.length && (!p.sewer_type || !f.sewer_in.includes(p.sewer_type))) return { ok: false, reason: "sewer" };
  return { ok: true };
}

function firedTriggers(t: Template, input: ScoreInput): FiredTrigger | null {
  let best: FiredTrigger | null = null;
  const consider = (c: FiredTrigger) => {
    if (!best || c.boost > best.boost || (c.boost === best.boost && c.date > best.date)) best = c;
  };
  for (const tr of t.triggers) {
    if (tr.kind === "sale") {
      const p = input.parcel;
      const ev = input.recentEvents
        .filter((e) => e.kind === "sale" && e.arms_length !== false && (e.amount ?? 0) >= 10_000)
        .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))[0];
      const date = ev?.event_date ?? ((p.last_sale_price ?? 0) >= 10_000 ? p.last_sale_date : null);
      if (date && daysBetween(date, input.today) <= tr.within_days && daysBetween(date, input.today) >= 0) {
        consider({ kind: "sale", label: tr.label, boost: tr.boost, date, event_id: ev?.id });
      }
    } else if (tr.kind === "violation") {
      const ev = input.recentEvents
        .filter((e) => e.kind === "violation" && e.category === tr.category && daysBetween(e.event_date, input.today) <= tr.within_days)
        .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))[0];
      if (ev) consider({ kind: "violation", label: tr.label, boost: tr.boost, date: ev.event_date, event_id: ev.id });
    } else if (tr.kind === "permit") {
      // Adjacent permit on this same home, e.g. a new pool for a fence company (Addendum A5).
      const ev = input.recentEvents
        .filter((e) => e.kind === "permit" && e.category === tr.category)
        .filter((e) => {
          const d = daysBetween(e.event_date, input.today);
          return d >= 0 && d <= tr.within_days;
        })
        .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))[0];
      if (ev) consider({ kind: "permit", label: tr.label, boost: tr.boost, date: ev.event_date, event_id: ev.id });
    } else if (tr.kind === "neighbor_job") {
      const s = input.signals[`neighbor_job:${tr.category}`];
      const date = s?.evidence.date;
      if (s && s.value >= 1 && date && daysBetween(date, input.today) <= tr.within_days) {
        consider({ kind: "neighbor_job", label: tr.label, boost: tr.boost, date, event_id: s.evidence.event_id });
      }
    }
  }
  return best;
}

function renderPitch(t: Template, input: ScoreInput, reasons: Reason[]): string {
  const top = reasons[0]?.label ?? "Good fit for your work";
  let s = t.pitch;
  // Drop "Built 1947." when there is no year or the top reason already says it.
  if (!input.parcel.year_built || /^Built \d{4}/.test(top)) s = s.replace(/Built \{year_built\}\.\s*/, "");
  return s
    .replace("{year_built}", String(input.parcel.year_built ?? ""))
    .replace("{top_reason}", top)
    .replace("{city}", input.parcel.city)
    .replace(/\s+/g, " ")
    .trim();
}

/** Score one home for one template + profile. Call passesFilters first. */
export function scoreParcel(t: Template, profile: Profile, input: ScoreInput): ScoreResult {
  let num = 0;
  let den = 0;
  const contributions: Reason[] = [];
  for (const key of Object.keys(t.signals).sort()) {
    const ts = t.signals[key]!;
    const wml = ts.weight * multiplier(profile, key) * learned(profile, key);
    if (wml === 0) continue;
    const r = resolveSignal(key, ts, input, profile);
    if (!r) {
      // No data for this home: use the population average when known, else leave the signal out.
      const prior = input.priors?.[key];
      if (prior === undefined) continue;
      num += wml * clamp(prior, 0, 1);
      den += wml;
      continue;
    }
    const v = clamp(r.v, 0, 1);
    num += wml * v;
    den += wml;
    if (v > 0 && r.label) contributions.push({ key, label: r.label, points: wml * v, evidence: r.evidence });
  }
  const raw = den > 0 ? num / den : 0;
  const trigger = firedTriggers(t, input);
  const boost = trigger ? clamp(trigger.boost, 0, 15) : 0;
  const score = clamp(Math.round(100 * raw + boost), 0, 100);

  // Reasons: top 3-5 contributors, points scaled to their share of the 0-100 base score.
  contributions.sort((a, b) => b.points - a.points || (a.key < b.key ? -1 : 1));
  const reasons = contributions.slice(0, 5).map((c) => ({ ...c, points: den > 0 ? Math.round((100 * c.points) / den) : 0 }));

  return {
    score,
    reasons,
    pitch: renderPitch(t, input, reasons),
    trigger,
    qualifies: score >= t.threshold || trigger !== null,
  };
}
