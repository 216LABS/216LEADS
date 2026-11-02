// AI business profile wizard (Addendum A2-A5), the parts that need no LLM: the answers schema,
// the closest-preset fallback, adjacent-permit suggestions, applying the user's explicit choices
// to any recipe, and the plain-English summary / diff for the confirm screen.
import { z } from "zod";
import { CATEGORY_KEYS, CATEGORY_NOUN } from "./categories";
import { PROFILE_PROMPT, TEMPLATES } from "./generated";
import { CATEGORY_SIGNALS, parseRecipe, PLAIN_SIGNALS, SURVEY_PARTS } from "./recipe";
import { signalLabel, triggerSentence } from "./describe";
import type { Template, TriggerDef } from "./types";

export const JOB_VALUES = [
  { value: "lt500", label: "Under $500" },
  { value: "500_2k", label: "$500 to $2K" },
  { value: "2k_10k", label: "$2K to $10K" },
  { value: "10k_plus", label: "$10K or more" },
] as const;

export const FOCUS = [
  { value: "new_movers", label: "New movers" },
  { value: "needs_work", label: "Homes that need work soon" },
  { value: "both", label: "Both" },
] as const;

const category = z.string().refine((c) => CATEGORY_KEYS.includes(c), { message: "unknown permit category" });

/** Wizard answers (A2). Stored in org_profile.answers; never holds parcel data. */
export const answersSchema = z.object({
  business_name: z.string().trim().min(2).max(80),
  sells: z.string().trim().min(3).max(300),
  job_value: z.enum(["lt500", "500_2k", "2k_10k", "10k_plus"]),
  best_customer: z.string().trim().max(600).default(""),
  bad_fit: z.string().trim().max(400).default(""),
  zips: z.array(z.string().regex(/^\d{5}$/)).min(1).max(25),
  focus: z.enum(["new_movers", "needs_work", "both"]).default("both"),
  never: z.object({
    rentals: z.boolean().default(false),
    condos: z.boolean().default(false),
    tax_delinquent: z.boolean().default(false),
    price_min: z.number().int().min(0).max(5_000_000).nullable().default(null),
    price_max: z.number().int().min(0).max(5_000_000).nullable().default(null),
  }).default({}),
  adjacent: z.array(category).max(8).default([]),
  /** Spec 9.1 preset path: the trade tile picked instead of answering the questions. */
  preset: z.string().refine((k) => k in TEMPLATES, { message: "unknown preset" }).optional(),
});

export type WizardAnswers = z.infer<typeof answersSchema>;

// Keyword -> preset, for the no-key path and the "closest preset" fallback (decision 26).
const PRESET_WORDS: [string, RegExp][] = [
  ["septic", /\bseptic/],
  ["gutters", /\bgutter|downspout|leaf guard/],
  ["roofing", /\broof|shingle/],
  ["hvac", /\bhvac|furnace|heating|air condition|\ba\/?c\b|heat pump|boiler|duct/],
  ["plumbing", /\bplumb|drain|water heater|sewer|pipe/],
  ["electrical", /\belectric|generator|ev charg|solar|wiring/],
  ["waterproofing", /\bwaterproof|basement|foundation|sump/],
  ["siding", /\bsiding|windows?\b|doors?\b/],
  ["painting", /\bpaint/],
  ["tree", /\btree|stump|arborist/],
  ["lawn_care", /\blawn|landscap|mow|yard|sod\b|irrigation/],
  ["fence", /\bfenc/],
  ["pest", /\bpest|extermin|termite|rodent|bed ?bug|mosquito/],
  ["remodel", /\bremodel|kitchen|bath|renovat|general contract|handyman|addition|concrete|driveway|deck/],
];

/** The preset whose keywords appear earliest in the description; `new_movers` when none do. */
export function closestPreset(text: string): string {
  const t = text.toLowerCase();
  let best: { key: string; at: number } | null = null;
  for (const [key, re] of PRESET_WORDS) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.at)) best = { key, at: m.index };
  }
  return best?.key ?? "new_movers";
}

/** Categories the wizard offers in "Other projects that send you work?" (A2 question 8). */
export const ADJACENT_CHOICES = ["pool", "new_build", "remodel", "demolition", "roofing", "siding", "windows", "garage", "hvac", "plumbing", "fence_deck", "concrete"];

// Addendum A5 table: business -> adjacent permit categories and window (days).
const ADJACENT: Record<string, { categories: string[]; days: number }> = {
  fence: { categories: ["pool", "new_build"], days: 90 },
  lawn_care: { categories: ["new_build", "remodel", "pool", "demolition"], days: 120 },
  gutters: { categories: ["roofing", "siding"], days: 60 },
  siding: { categories: ["remodel"], days: 90 },
  electrical: { categories: ["pool", "garage", "remodel", "hvac"], days: 60 },
  painting: { categories: ["siding", "remodel", "windows"], days: 90 },
  waterproofing: { categories: ["plumbing"], days: 60 },
  pest: { categories: ["demolition", "new_build"], days: 60 },
  cleaning: { categories: ["remodel", "demolition"], days: 60 },
  concrete: { categories: ["garage", "new_build", "demolition"], days: 90 },
};

function adjacentKey(text: string): string {
  // Cleaning and concrete have rows in the A5 table but no preset of their own.
  const t = text.toLowerCase();
  const preset = closestPreset(t);
  // A cleaning *business*, not "teeth cleanings" or "yard cleanups".
  if (preset === "new_movers" && /\b(house|home|office|carpet|window|move-?out|deep) ?clean|cleaning (company|service|business)|\bmaids?\b|\bjunk\b|\bhauling\b/.test(t)) return "cleaning";
  if (preset === "remodel" && /\bconcrete|driveway|paving/.test(t)) return "concrete";
  return preset;
}

/** Adjacent permit categories to pre-tick for this business (the user confirms). */
export function suggestAdjacent(text: string): string[] {
  return ADJACENT[adjacentKey(text)]?.categories ?? [];
}

function adjacentDays(text: string, cat: string): number {
  const a = ADJACENT[adjacentKey(text)];
  return a && a.categories.includes(cat) ? a.days : 90;
}

const permitLabel = (cat: string) => `New ${CATEGORY_NOUN[cat] ?? cat.replace(/_/g, " ")} permit`.slice(0, 60);

/** The closest preset, as a recipe draft for these answers (the no-LLM path). */
export function presetRecipe(answers: WizardAnswers): Template & { preset_base: string; rationale: string[] } {
  const key = answers.preset ?? closestPreset(`${answers.sells} ${answers.best_customer}`);
  const t = structuredClone(TEMPLATES[key]!);
  return { ...t, preset_base: key, rationale: [] };
}

/**
 * Apply the choices the user made explicitly (A2 questions 6-8) to any recipe, the LLM's or a
 * preset: exclusions and price limits exactly as answered, the "who first" emphasis, and
 * permit triggers for exactly the adjacent categories they ticked. Returns a valid recipe.
 */
export function applyAnswers<T extends Template>(recipe: T, answers: WizardAnswers): T {
  const r = structuredClone(recipe);
  r.default_exclusions = {
    ...r.default_exclusions,
    rentals: answers.never.rentals,
    condos: answers.never.condos,
    tax_delinquent: answers.never.tax_delinquent,
  };
  const { price_min, price_max } = answers.never;
  r.default_filters = { ...r.default_filters };
  if (price_min !== null) r.default_filters.price_min = price_min;
  if (price_max !== null) r.default_filters.price_max = price_max;
  if ((price_min !== null || price_max !== null) && !r.signals.price_band && Object.keys(r.signals).length < 12) {
    r.signals.price_band = { weight: 10 };
  }

  if (answers.focus === "new_movers") {
    const w = r.signals.new_owner?.weight ?? 0;
    if (r.signals.new_owner || Object.keys(r.signals).length < 12) r.signals.new_owner = { weight: Math.min(40, Math.max(30, w + 10)) };
    const sale = r.triggers.find((t) => t.kind === "sale");
    if (sale) sale.boost = Math.max(sale.boost, 12);
    else r.triggers.unshift({ kind: "sale", within_days: 30, boost: 12, label: "Just moved in" });
  } else if (answers.focus === "needs_work" && r.signals.new_owner) {
    r.signals.new_owner = { weight: Math.round(r.signals.new_owner.weight / 2) };
  }

  const ticked = new Set(answers.adjacent);
  const kept = r.triggers.filter((t) => t.kind !== "permit" || (t.category && ticked.has(t.category)));
  const have = new Set(kept.filter((t) => t.kind === "permit").map((t) => t.category));
  const text = `${answers.sells} ${answers.best_customer}`;
  const added: TriggerDef[] = [...ticked]
    .filter((c) => !have.has(c))
    .map((c) => ({ kind: "permit", category: c, within_days: Math.min(120, adjacentDays(text, c)), boost: 10, label: permitLabel(c) }));
  r.triggers = [...kept, ...added].slice(0, 10);
  r.sliders = r.sliders.filter((s) => s.key in r.signals);

  const checked = parseRecipe(r);
  return checked.ok ? (checked.recipe as T) : recipe;
}

const money = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

/** One-paragraph plain-English summary for the confirm screen (A4). */
export function describeRecipe(t: Template): string {
  const top = Object.entries(t.signals).filter(([, v]) => v.weight > 0).sort((a, b) => b[1].weight - a[1].weight).slice(0, 4);
  const parts = [`We'll put these homes first: ${top.map(([k]) => signalLabel(k).toLowerCase()).join(", ")}.`];
  const trig = t.triggers.slice(0, 3).map((x) => triggerSentence(x).toLowerCase());
  if (trig.length) parts.push(`A home moves up right away when: ${trig.join("; ")}.`);
  const f = t.default_filters;
  if (f.price_min || f.price_max) {
    parts.push(f.price_min && f.price_max ? `Homes valued ${money(f.price_min)}-${money(f.price_max)}.`
      : f.price_min ? `Homes valued over ${money(f.price_min)}.` : `Homes valued under ${money(f.price_max!)}.`);
  }
  if (f.owner_occupied) parts.push("Owner-occupied homes only.");
  const skip = [t.default_exclusions.rentals && "rentals", t.default_exclusions.condos && "condos", t.default_exclusions.tax_delinquent && "tax-delinquent homes"].filter(Boolean);
  if (skip.length) parts.push(`Skipping ${skip.join(" and ")}.`);
  return parts.join(" ");
}

/** What changed between two recipes, in plain English ("tweak it" diff, A4). */
export function recipeDiff(a: Template, b: Template): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a.signals), ...Object.keys(b.signals)])) {
    const x = a.signals[k]?.weight;
    const y = b.signals[k]?.weight;
    if (x === undefined) out.push(`Added: ${signalLabel(k)} (weight ${y})`);
    else if (y === undefined) out.push(`Removed: ${signalLabel(k)}`);
    else if (x !== y) out.push(`${signalLabel(k)}: weight ${x} → ${y}`);
  }
  if (a.threshold !== b.threshold) out.push(`Lead score cutoff: ${a.threshold} → ${b.threshold}`);
  const sig = (t: TriggerDef) => `${t.kind}:${t.category ?? ""}:${t.within_days}:${t.boost}`;
  const as = new Set(a.triggers.map(sig));
  const bs = new Set(b.triggers.map(sig));
  for (const t of b.triggers) if (!as.has(sig(t))) out.push(`New trigger: ${triggerSentence(t)} (+${t.boost})`);
  for (const t of a.triggers) if (!bs.has(sig(t))) out.push(`Dropped trigger: ${triggerSentence(t)}`);
  for (const k of ["price_min", "price_max", "year_built_max", "lot_acres_min", "owner_occupied"] as const) {
    if (a.default_filters[k] !== b.default_filters[k]) out.push(`${k.replace(/_/g, " ")}: ${a.default_filters[k] ?? "any"} → ${b.default_filters[k] ?? "any"}`);
  }
  for (const k of ["rentals", "condos", "tax_delinquent"] as const) {
    if (!!a.default_exclusions[k] !== !!b.default_exclusions[k]) out.push(`${b.default_exclusions[k] ? "Skip" : "Include"} ${k.replace(/_/g, "-")}`);
  }
  return out;
}

function bump(r: Template, key: string, by: number) {
  if (!r.signals[key] && Object.keys(r.signals).length >= 12) return;
  r.signals[key] = { ...r.signals[key], weight: Math.max(0, Math.min(40, (r.signals[key]?.weight ?? 0) + by)) };
}

/**
 * "Tweak it" without an LLM: a few common instructions as rules. `understood` is false when no
 * rule matched; the recipe is then unchanged.
 */
export function keywordTweak<T extends Template>(recipe: T, instruction: string): { recipe: T; understood: boolean } {
  const r = structuredClone(recipe);
  const s = instruction.toLowerCase();
  let hit = false;
  const rule = (re: RegExp, fn: () => void) => {
    if (re.test(s)) {
      fn();
      hit = true;
    }
  };
  const pricier = /(fewer|less|no) cheap|more expensive|high.?end|pricier|nicer homes/;
  rule(pricier, () => {
    r.default_filters = { ...r.default_filters, price_min: Math.max(150_000, Math.round((r.default_filters.price_min ?? 120_000) * 1.25)) };
    bump(r, "price_band", 10);
  });
  if (!pricier.test(s)) {
    rule(/(fewer|less|no) expensive|cheaper|affordable|budget|starter/, () => {
      r.default_filters = { ...r.default_filters, price_max: Math.round((r.default_filters.price_max ?? 300_000) * 0.8) };
      bump(r, "price_band", 10);
    });
  }
  rule(/big(ger)? lots?|more land|acre|big yards?/, () => bump(r, "lot_size", 10));
  rule(/big(ger)? (homes|houses)|more square/, () => bump(r, "living_area", 10));
  rule(/new (movers|owners|buyers)|just (moved|sold|bought)/, () => bump(r, "new_owner", 10));
  rule(/old(er)? (homes|houses)/, () => bump(r, "home_age", 10));
  rule(/\btrees?\b|shade/, () => bump(r, "canopy", 10));
  rule(/(no|skip|without) rentals?/, () => { r.default_exclusions = { ...r.default_exclusions, rentals: true }; });
  rule(/(no|skip|without) condos?/, () => { r.default_exclusions = { ...r.default_exclusions, condos: true }; });
  rule(/fewer (leads|homes)|stricter|pickier|only the best/, () => { r.threshold = Math.min(80, r.threshold + 5); });
  rule(/more (leads|homes)|looser|broader|wider/, () => { r.threshold = Math.max(40, r.threshold - 5); });
  const checked = parseRecipe(r);
  return checked.ok && hit ? { recipe: checked.recipe as T, understood: true } : { recipe, understood: false };
}

/** The A3 system prompt with the signal library, categories and presets filled in from code. */
export function profilePrompt(): string {
  const signals = [
    ...PLAIN_SIGNALS.map((k) => `- \`${k}\`: ${signalLabel(k)}`),
    ...CATEGORY_SIGNALS.map((k) => `- \`${k}:<category>\`: ${signalLabel(`${k}:roofing`).replace(/roof/i, "<category>")}`),
    `- \`survey_condition:<part>\`: Cleveland's 2022 property survey condition, part one of ${SURVEY_PARTS.join(", ")}`,
  ].join("\n");
  const presets = JSON.stringify(Object.values(TEMPLATES).map(({ sliders: _s, ...t }) => t));
  return PROFILE_PROMPT.replace("{{SIGNALS}}", signals).replace("{{CATEGORIES}}", CATEGORY_KEYS.join(", ")).replace("{{PRESETS}}", presets);
}

/** The user turn: the answers, minus the territory (the LLM needs no location). */
export function answersMessage(a: WizardAnswers): string {
  const value = JOB_VALUES.find((j) => j.value === a.job_value)?.label;
  const focus = FOCUS.find((f) => f.value === a.focus)?.label;
  return [
    `What they sell: ${a.sells}`,
    `Typical job or customer value: ${value}`,
    `Best customer last year: ${a.best_customer || "(not given)"}`,
    `Bad fit: ${a.bad_fit || "(not given)"}`,
    `Who they want first: ${focus}`,
    `Never show: ${[a.never.rentals && "rentals", a.never.condos && "condos", a.never.tax_delinquent && "tax-delinquent homes",
      a.never.price_min !== null && `homes under $${a.never.price_min}`, a.never.price_max !== null && `homes over $${a.never.price_max}`]
      .filter(Boolean).join(", ") || "(nothing)"}`,
    `Other projects that send them work (permit categories): ${a.adjacent.join(", ") || "(none)"}`,
  ].join("\n");
}

// Spec 9.1 step 3 "Your perfect customer": plain controls that read and write a recipe's
// default filters and exclusions. Values the controls don't offer are kept as they are.
export const HOME_AGES = [
  { value: "any", label: "Any" }, { value: "30", label: "30+ yrs" }, { value: "50", label: "50+ yrs" }, { value: "pre1950", label: "Pre-1950" },
] as const;
export const LOT_SIZES = [
  { value: "any", label: "Any" }, { value: "0.25", label: "1/4 ac+" }, { value: "0.5", label: "1/2 ac+" }, { value: "1", label: "1 ac+" },
] as const;
export const HEAT = [{ value: "any", label: "Any" }, { value: "gas", label: "Gas" }, { value: "no_gas", label: "No gas line" }] as const;
/** Two-handle value slider range; the top stop means "no upper limit". */
export const PRICE_STOPS = [50_000, 75_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000, 500_000, 750_000, 1_000_000];

export interface CustomerControls {
  age: (typeof HOME_AGES)[number]["value"];
  price_min: number | null;
  price_max: number | null;
  lot: (typeof LOT_SIZES)[number]["value"];
  heat: (typeof HEAT)[number]["value"];
  owner_occupied: boolean;
  rentals: boolean;
  condos: boolean;
  streets: string[];
}

export function customerControls(t: Template, thisYear: number): CustomerControls {
  const f = t.default_filters;
  const x = t.default_exclusions;
  const ymax = f.year_built_max ?? null;
  const age = ymax === null ? "any" : ymax <= 1949 ? "pre1950" : ymax <= thisYear - 50 ? "50" : "30";
  const lotMin = f.lot_acres_min ?? 0;
  const lot = lotMin >= 1 ? "1" : lotMin >= 0.5 ? "0.5" : lotMin >= 0.25 ? "0.25" : "any";
  return {
    age, lot, heat: f.gas ?? "any", price_min: f.price_min ?? null, price_max: f.price_max ?? null,
    owner_occupied: !!f.owner_occupied, rentals: !!x.rentals, condos: !!x.condos, streets: x.streets ?? [],
  };
}

export function applyCustomerControls<T extends Template>(t: T, c: CustomerControls, thisYear: number): T {
  const r = structuredClone(t);
  const f = { ...r.default_filters };
  const before = customerControls(t, thisYear);
  // Only rewrite a filter the user changed, so a preset's own values (e.g. lot >= 0.15 ac) survive.
  if (c.age !== before.age) f.year_built_max = c.age === "any" ? null : c.age === "pre1950" ? 1949 : thisYear - Number(c.age);
  if (c.lot !== before.lot) f.lot_acres_min = c.lot === "any" ? null : Number(c.lot);
  f.gas = c.heat;
  f.price_min = c.price_min;
  f.price_max = c.price_max;
  f.owner_occupied = c.owner_occupied;
  r.default_filters = f;
  const streets = [...new Set(c.streets.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 200);
  r.default_exclusions = { ...r.default_exclusions, rentals: c.rentals, condos: c.condos, streets };
  if ((c.price_min !== null || c.price_max !== null) && !r.signals.price_band && Object.keys(r.signals).length < 12) {
    r.signals = { ...r.signals, price_band: { weight: 10 } };
  }
  return r;
}
