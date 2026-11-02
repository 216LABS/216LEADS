// AI business profile wizard, server side (Addendum A2-A7): answers -> recipe through the LLM,
// validated by recipeSchema, one retry, then the closest preset. The LLM never sees parcel data
// and never writes lead reasons; preview counts and sample homes come from the scoring engine.
import Anthropic from "@anthropic-ai/sdk";
import { optionalEnv, type Sql } from "@216leads/db";
import {
  answersMessage, applyAnswers, closestPreset, hasTemplate, keywordTweak, parseRecipe, presetRecipe, profilePrompt,
  type Template, type WizardAnswers,
} from "@216leads/scoring";
import { saveRecipeVersion } from "./recipes";
import { importCustomers } from "./onboarding";

export type Recipe = Template & { preset_base?: string | null; rationale?: string[] };

/** One LLM turn: system prompt, conversation so far -> reply text. */
export interface LlmProvider {
  name: string;
  complete(system: string, turns: { role: "user" | "assistant"; content: string }[]): Promise<string>;
}

const MODEL = "claude-opus-5-5";

function anthropicProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });
  return {
    name: "anthropic",
    async complete(system, turns) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // Refused requests are re-run on a fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        // The system prompt (signal library + presets) is identical on every call: cache it.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: turns,
      });
      if (res.stop_reason === "refusal") throw new Error(`LLM refused (${res.stop_details?.category ?? "no category"})`);
      if (res.stop_reason === "max_tokens") throw new Error("LLM reply was cut off");
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    },
  };
}

/**
 * The configured provider, or null (then every build uses the closest preset, decision 26).
 * `LLM_PROVIDER=openai` is not wired yet (decision 41) and also falls back.
 */
export function llmFromEnv(): LlmProvider | null {
  const provider = (optionalEnv("LLM_PROVIDER") ?? "anthropic").toLowerCase();
  if (provider === "anthropic") {
    const key = optionalEnv("ANTHROPIC_API_KEY");
    return key ? anthropicProvider(key) : null;
  }
  if (provider === "openai" && optionalEnv("OPENAI_API_KEY")) console.warn("LLM_PROVIDER=openai is not supported yet; using presets");
  return null;
}

/** The JSON object in a reply (models sometimes wrap it in a code fence). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

/** Ask, validate, and on invalid output ask once more with the errors (A3). Null = give up. */
async function askForRecipe(llm: LlmProvider, user: string): Promise<Recipe | null> {
  const system = profilePrompt();
  const turns: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply = "";
    let errors: string[];
    try {
      reply = await llm.complete(system, turns);
      const parsed = parseRecipe(extractJson(reply));
      if (parsed.ok) return parsed.recipe as Recipe;
      errors = parsed.errors;
    } catch (e) {
      if (!reply) {
        console.warn(`profile: ${llm.name} call failed`, e instanceof Error ? e.message : e);
        return null;
      }
      errors = [e instanceof Error ? e.message : String(e)];
    }
    turns.push({ role: "assistant", content: reply }, {
      role: "user",
      content: `That recipe failed validation:\n- ${errors.slice(0, 10).join("\n- ")}\nReply with the corrected recipe as one JSON object only.`,
    });
  }
  return null;
}

export interface BuiltRecipe {
  recipe: Recipe;
  /** "ai" when the LLM's recipe was used; "preset" when the closest preset was. */
  via: "ai" | "preset";
}

/** POST /api/profile/build core: answers -> recipe draft. Never throws for LLM problems. */
export async function buildRecipe(answers: WizardAnswers, llm: LlmProvider | null = llmFromEnv()): Promise<BuiltRecipe> {
  // Spec 9.1 preset path: the trade tile as-is; the perfect-customer controls adjust it next.
  if (answers.preset) return { recipe: presetRecipe(answers), via: "preset" };
  const fromLlm = llm ? await askForRecipe(llm, answersMessage(answers)) : null;
  if (fromLlm) {
    const base = fromLlm.preset_base && hasTemplate(fromLlm.preset_base) ? fromLlm.preset_base : closestPreset(`${answers.sells} ${answers.best_customer}`);
    return { recipe: applyAnswers({ ...fromLlm, preset_base: base }, answers), via: "ai" };
  }
  return { recipe: applyAnswers(presetRecipe(answers), answers), via: "preset" };
}

/** POST /api/profile/tweak core: current recipe + instruction -> new draft. */
export async function tweakRecipe(
  recipe: Recipe,
  instruction: string,
  llm: LlmProvider | null = llmFromEnv(),
): Promise<{ recipe: Recipe; via: "ai" | "rules"; understood: boolean }> {
  if (llm) {
    const out = await askForRecipe(llm, [
      "Here is the current recipe:",
      JSON.stringify(recipe),
      `The business owner asks: "${instruction}"`,
      "Change only what that asks for and keep everything else as it is.",
    ].join("\n"));
    if (out) return { recipe: { ...out, preset_base: recipe.preset_base ?? out.preset_base ?? null }, via: "ai", understood: true };
  }
  const t = keywordTweak(recipe, instruction);
  return { recipe: t.recipe, via: "rules", understood: t.understood };
}

/**
 * Finish onboarding (A2): create the org from the wizard answers, its territory, profile
 * answers and the confirmed recipe as the active version. Returns the new org id.
 */
export async function createOrgFromWizard(
  sql: Sql,
  v: { userId: string; email: string; answers: WizardAnswers; recipe: unknown; multipliers?: Record<string, number>; customers?: string[] },
): Promise<string> {
  const parsed = parseRecipe(v.recipe);
  if (!parsed.ok) throw new Error(`Invalid recipe: ${parsed.errors.slice(0, 3).join("; ")}`);
  const r = parsed.recipe as Recipe;
  const trade = r.preset_base && hasTemplate(r.preset_base) ? r.preset_base : closestPreset(v.answers.sells);
  const orgId = await sql.begin(async (tx) => {
    const [org] = await tx<{ id: string }[]>`
      insert into org (name, trade, plan, trial_ends_at, onboarded_at, digest_emails)
      values (${v.answers.business_name}, ${trade}, 'trial', now() + interval '14 days', now(), ${[v.email]})
      returning id`;
    await tx`insert into org_member (org_id, user_id, role) values (${org!.id}, ${v.userId}, 'owner')`;
    for (const z of [...new Set(v.answers.zips)]) await tx`insert into territory (org_id, kind, zip) values (${org!.id}, 'zip', ${z})`;
    await tx`insert into org_profile (org_id, answers) values (${org!.id}, ${tx.json(v.answers as never)})`;
    return org!.id;
  });
  await saveRecipeVersion(sql, {
    orgId, recipe: r, multipliers: v.multipliers, source: v.answers.preset ? "preset" : "wizard", userId: v.userId, activate: true,
    note: v.answers.preset ? "Started from a preset" : "Built from your answers",
  });
  if (v.customers?.length) await importCustomers(sql, orgId, v.customers);
  return orgId;
}

/** Save new wizard answers for an existing org (re-running the wizard from Settings). */
export async function saveOrgAnswers(sql: Sql, orgId: string, answers: WizardAnswers) {
  await sql`
    insert into org_profile (org_id, answers) values (${orgId}, ${sql.json(answers as never)})
    on conflict (org_id) do update set answers = excluded.answers, updated_at = now()`;
}
