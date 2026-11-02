import { CATEGORY_PATTERNS } from "./generated";

const COMPILED: [string, RegExp][] = CATEGORY_PATTERNS.map(([k, p]) => [k, new RegExp(p, "i")]);

// "SEPARATE PERMITS REQUIRED FOR ELEC, PLUM, HVAC, SIDEWALK." names work that is *not* part
// of this permit; drop that clause before matching.
const SEPARATE_CLAUSE = /\b(separate|seperate|sep)\b\.?[^.]*(\.|$)|[^.]*\bpermits? (are |is )?req(uire)?['’]?d?\b[^.]*(\.|$)/gi;

/**
 * Normalized trade category for a permit or violation (spec 7.3). First match wins.
 * Patterns see "raw_type | description": `^` anchors on the source's own category and
 * `\|` on the start of the description.
 */
export function categorize(rawType: string | null | undefined, description: string | null | undefined): string | null {
  const desc = (description ?? "").replace(/\breq['’]?d\./gi, "reqd").replace(SEPARATE_CLAUSE, " ");
  const text = `${rawType ?? ""} | ${desc}`;
  for (const [key, re] of COMPILED) if (re.test(text)) return key;
  return null;
}

export const CATEGORY_KEYS = [...new Set(CATEGORY_PATTERNS.map(([k]) => k))];

/** Categories that describe the permit but are not a trade (never used as a trade signal). */
export const NON_TRADE_CATEGORIES = new Set(["boardup", "signage", "occupancy", "elevator"]);

/** Words used in reason labels: "No roof permit on record since 2015". */
export const CATEGORY_NOUN: Record<string, string> = {
  demolition: "demolition", roofing: "roof", hvac: "HVAC", plumbing: "plumbing", electrical: "electrical",
  waterproof: "waterproofing", siding: "siding", windows: "window", gutters: "gutter", painting: "paint",
  concrete: "concrete", fence_deck: "fence/deck", garage: "garage", pool: "pool", tree: "tree", remodel: "remodel",
  boardup: "board-up", signage: "sign", occupancy: "change-of-use", elevator: "elevator", new_build: "new home",
};

/** Template trade -> the permit category its "last permit" signals use. */
export const TRADE_CATEGORY: Record<string, string> = {
  roofing: "roofing", hvac: "hvac", plumbing: "plumbing", electrical: "electrical", lawn_care: "tree",
  tree: "tree", painting: "painting", gutters: "gutters", siding: "siding", remodel: "remodel",
  pest: "remodel", septic: "plumbing", waterproofing: "waterproof",
};
