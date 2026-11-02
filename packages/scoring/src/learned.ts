// Feedback loop (spec 7.6): per signal, compare how strongly it showed on homes the org won
// versus homes it lost (skipped counts as half a loss), and nudge its weight within 0.8-1.25.
import { resolveSignal } from "./signals";
import type { Profile, ScoreInput, Template } from "./types";

export type Outcome = "won" | "lost" | "skipped";

export interface LearnedSignal {
  won: number;
  lost: number;
  factor: number;
}

export interface LearnedResult {
  /** Signal key -> factor, only for factors that differ from 1. */
  weights: Record<string, number>;
  meta: Record<string, LearnedSignal>;
  outcomes: number;
}

/** Outcomes needed before any nudge applies. */
export const MIN_OUTCOMES = 10;

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export function learnWeights(t: Template, profile: Profile, rows: { input: ScoreInput; outcome: Outcome }[]): LearnedResult {
  if (rows.length < MIN_OUTCOMES) return { weights: {}, meta: {}, outcomes: rows.length };
  const weights: Record<string, number> = {};
  const meta: Record<string, LearnedSignal> = {};
  for (const key of Object.keys(t.signals).sort()) {
    let wonSum = 0, wonN = 0, lostSum = 0, lostN = 0;
    for (const r of rows) {
      const res = resolveSignal(key, t.signals[key]!, r.input, profile);
      const v = res ? clamp(res.v, 0, 1) : r.input.priors?.[key];
      if (v === undefined) continue;
      if (r.outcome === "won") {
        wonSum += v;
        wonN += 1;
      } else {
        const w = r.outcome === "skipped" ? 0.5 : 1;
        lostSum += v * w;
        lostN += w;
      }
    }
    if (!wonN || !lostN) continue;
    const won = wonSum / wonN;
    const lost = lostSum / lostN;
    const factor = Math.round(clamp(1 + 0.25 * (won - lost), 0.8, 1.25) * 1000) / 1000;
    meta[key] = { won: Math.round(won * 1000) / 1000, lost: Math.round(lost * 1000) / 1000, factor };
    if (factor !== 1) weights[key] = factor;
  }
  return { weights, meta, outcomes: rows.length };
}

/** "We nudged 'Tree canopy' up because your wins have more of it." */
export function nudgeSentence(label: string, factor: number): string {
  return factor > 1
    ? `We nudged "${label}" up because the homes you won show it more than the ones you lost.`
    : `We nudged "${label}" down because the homes you won show it less than the ones you lost.`;
}
