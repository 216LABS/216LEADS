export * from "./types";
export { TEMPLATES, CATEGORY_PATTERNS } from "./generated";
export { categorize, CATEGORY_KEYS, CATEGORY_NOUN, TRADE_CATEGORY } from "./categories";
export { scoreParcel, passesFilters, effectiveProfile } from "./engine";
export { resolveSignal, surveyValue } from "./signals";
export { percentileRanks } from "./percentile";

import { TEMPLATES } from "./generated";
import type { Template } from "./types";

export function getTemplate(key: string): Template {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`Unknown trade template: ${key}`);
  return t;
}

export function hasTemplate(key: string): boolean {
  return key in TEMPLATES;
}
