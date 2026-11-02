import { CATEGORY_PATTERNS } from "./generated";

const COMPILED: [string, RegExp][] = CATEGORY_PATTERNS.map(([k, p]) => [k, new RegExp(p, "i")]);

/** Normalized trade category for a permit or violation (spec 7.3). First match wins. */
export function categorize(rawType: string | null | undefined, description: string | null | undefined): string | null {
  const text = `${rawType ?? ""} ${description ?? ""}`;
  for (const [key, re] of COMPILED) if (re.test(text)) return key;
  return null;
}

export const CATEGORY_KEYS = CATEGORY_PATTERNS.map(([k]) => k);

/** Words used in reason labels: "No roof permit on record since 2015". */
export const CATEGORY_NOUN: Record<string, string> = {
  demolition: "demolition", roofing: "roof", hvac: "HVAC", plumbing: "plumbing", electrical: "electrical",
  waterproof: "waterproofing", siding: "siding", windows: "window", gutters: "gutter", painting: "paint",
  concrete: "concrete", fence_deck: "fence/deck", garage: "garage", pool: "pool", tree: "tree", remodel: "remodel",
};

/** Template trade -> the permit category its "last permit" signals use. */
export const TRADE_CATEGORY: Record<string, string> = {
  roofing: "roofing", hvac: "hvac", plumbing: "plumbing", electrical: "electrical", lawn_care: "tree",
  tree: "tree", painting: "painting", gutters: "gutters", siding: "siding", remodel: "remodel",
  pest: "remodel", septic: "plumbing", waterproofing: "waterproof",
};
