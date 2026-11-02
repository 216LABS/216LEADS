// Recipe = a scoring template in the spec 7.4 format. Presets are recipes; the AI profile
// wizard (Addendum A3) writes recipes too. This schema is the single gate both pass through.
import { z } from "zod";
import { CATEGORY_KEYS } from "./categories";
import type { Template } from "./types";

/** Signals with no argument (spec 7.2, plus `garage` used by the electrical preset). */
export const PLAIN_SIGNALS = [
  "new_owner", "home_age", "era_pre1950", "price_band", "lot_size", "canopy", "grass", "living_area",
  "no_gas", "well_water", "septic", "flood", "owner_occupied", "condo", "garage",
] as const;

/** Signals that take a permit/violation category: `last_permit_age:roofing`. */
export const CATEGORY_SIGNALS = ["no_recent_permit", "last_permit_age", "active_violation", "neighbor_job"] as const;

/** 2022 Cleveland survey parts: `survey_condition:roof`. */
export const SURVEY_PARTS = ["roof", "gutters", "siding", "windows", "porch", "chimney", "driveway", "garage", "paint_peeling", "grade"] as const;

export function isKnownSignal(key: string): boolean {
  const [base, arg, extra] = key.split(":");
  if (extra !== undefined) return false;
  if (arg === undefined) return (PLAIN_SIGNALS as readonly string[]).includes(base!);
  if (base === "survey_condition") return (SURVEY_PARTS as readonly string[]).includes(arg);
  return (CATEGORY_SIGNALS as readonly string[]).includes(base!) && CATEGORY_KEYS.includes(arg);
}

const category = z.string().refine((c) => CATEGORY_KEYS.includes(c), { message: "unknown permit category (spec 7.3)" });

const trigger = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sale"), within_days: z.number().int().min(1).max(365), boost: z.number().int().min(0).max(15), label: z.string().min(2).max(60) }),
  z.object({ kind: z.literal("violation"), category, within_days: z.number().int().min(1).max(365), boost: z.number().int().min(0).max(15), label: z.string().min(2).max(60) }),
  z.object({ kind: z.literal("neighbor_job"), category, within_days: z.number().int().min(1).max(120), boost: z.number().int().min(0).max(15), label: z.string().min(2).max(60) }),
  z.object({ kind: z.literal("permit"), category, within_days: z.number().int().min(1).max(120), boost: z.number().int().min(0).max(15), label: z.string().min(2).max(60) }),
  z.object({ kind: z.literal("manual"), within_days: z.number().int().min(1).max(365), boost: z.number().int().min(0).max(15), label: z.string().min(2).max(60) }),
]);

const filters = z.object({
  year_built_max: z.number().int().min(1800).max(2100).nullable().optional(),
  price_min: z.number().int().min(0).nullable().optional(),
  price_max: z.number().int().min(0).nullable().optional(),
  lot_acres_min: z.number().min(0).max(100).nullable().optional(),
  canopy_min: z.number().min(0).max(100).nullable().optional(),
  gas: z.enum(["any", "gas", "no_gas"]).optional(),
  owner_occupied: z.boolean().optional(),
  zips: z.array(z.string().regex(/^\d{5}$/)).optional(),
  sewer_in: z.array(z.string()).optional(),
}).strict();

const exclusions = z.object({
  rentals: z.boolean().optional(),
  condos: z.boolean().optional(),
  condemned: z.boolean().optional(),
  tax_delinquent: z.boolean().optional(),
  streets: z.array(z.string().max(80)).max(200).optional(),
  parcel_keys: z.array(z.string()).max(5000).optional(),
}).strict();

export const recipeSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  version: z.number().int().min(1),
  label: z.string().min(2).max(60),
  threshold: z.number().int().min(40).max(80),
  signals: z
    .record(
      z.string().refine(isKnownSignal, { message: "unknown signal (spec 7.2)" }),
      z.object({ weight: z.number().int().min(0).max(40), lifespan_years: z.number().int().min(1).max(100).optional() }).strict(),
    )
    .refine((s) => Object.keys(s).length >= 2 && Object.keys(s).length <= 12, { message: "a recipe uses 2 to 12 signals" })
    .refine((s) => Object.values(s).some((v) => v.weight > 0), { message: "at least one signal needs weight" }),
  triggers: z.array(trigger).max(10),
  sliders: z.array(z.object({ key: z.string(), label: z.string().min(2).max(40) })).max(6).default([]),
  default_filters: filters.default({}),
  default_exclusions: exclusions.default({}),
  pitch: z.string().min(10).max(300),
  /** Wizard output only: closest preset and one sentence per signal. */
  preset_base: z.string().nullable().optional(),
  rationale: z.array(z.string().max(300)).max(12).optional(),
}).superRefine((r, ctx) => {
  for (const s of r.sliders) {
    if (!(s.key in r.signals)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sliders"], message: `slider ${s.key} is not a recipe signal` });
  }
});

export type Recipe = z.infer<typeof recipeSchema>;

export function parseRecipe(input: unknown): { ok: true; recipe: Template } | { ok: false; errors: string[] } {
  const r = recipeSchema.safeParse(input);
  if (r.success) return { ok: true, recipe: r.data as unknown as Template };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "recipe"}: ${i.message}`) };
}
