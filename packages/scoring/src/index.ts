export * from "./types";
export { TEMPLATES, CATEGORY_PATTERNS } from "./generated";
export { categorize, CATEGORY_KEYS, CATEGORY_NOUN, TRADE_CATEGORY } from "./categories";
export { scoreParcel, passesFilters, effectiveProfile } from "./engine";
export { resolveSignal, surveyValue, posCity, POS_SALE_DAYS } from "./signals";
export { POS_CITIES, POS_SOURCE } from "./generated";
export { percentileRanks } from "./percentile";
export { learnWeights, nudgeSentence, MIN_OUTCOMES, type LearnedResult, type LearnedSignal, type Outcome } from "./learned";
export { signalLabel, triggerSentence } from "./describe";
export { recipeSchema, parseRecipe, isKnownSignal, PLAIN_SIGNALS, CATEGORY_SIGNALS, SURVEY_PARTS, type Recipe } from "./recipe";

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
export {
  answersSchema, applyAnswers, answersMessage, closestPreset, describeRecipe, keywordTweak, presetRecipe, profilePrompt, recipeDiff,
  suggestAdjacent, ADJACENT_CHOICES, FOCUS, JOB_VALUES, type WizardAnswers,
  applyCustomerControls, customerControls, HEAT, HOME_AGES, LOT_SIZES, PRICE_STOPS, type CustomerControls,
} from "./profile";
