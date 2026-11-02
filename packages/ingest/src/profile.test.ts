// Addendum A8 golden tests for the profile wizard (no database). The no-key path is what CI and
// `pnpm local` run; fake providers cover the LLM path's retry and fallback.
import { describe, expect, it } from "vitest";
import { answersSchema, getTemplate, keywordTweak, parseRecipe, recipeDiff, suggestAdjacent } from "@216leads/scoring";
import { buildRecipe, extractJson, openaiProvider, tweakRecipe, type LlmProvider } from "./profile";
import { GOLDEN, goldenAnswers } from "./profile.golden";

const fake = (replies: (string | Error)[]): LlmProvider & { calls: number } => {
  const p = {
    name: "fake",
    calls: 0,
    async complete() {
      const r = replies[Math.min(p.calls++, replies.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return p;
};

describe("profile wizard golden tests (A8), no LLM key", () => {
  for (const g of GOLDEN) {
    it(`${g.name}: valid recipe with the expected signals and adjacent triggers`, async () => {
      const { recipe, via } = await buildRecipe(goldenAnswers(g), null);
      expect(via).toBe("preset");
      expect(parseRecipe(recipe).ok).toBe(true);
      expect(recipe.preset_base).toBe(g.preset);
      for (const s of g.signals) expect(Object.keys(recipe.signals)).toContain(s);
      const permits = recipe.triggers.filter((t) => t.kind === "permit").map((t) => t.category);
      for (const p of g.permits) expect(permits).toContain(p);
    });
  }

  it("the gutter company's recipe includes a roofing permit trigger", async () => {
    const a = answersSchema.parse({ business_name: "Gutter Co", sells: "Seamless gutters and leaf guards", job_value: "500_2k", zips: ["44107"], adjacent: suggestAdjacent("Seamless gutters") });
    const { recipe } = await buildRecipe(a, null);
    expect(recipe.triggers).toContainEqual(expect.objectContaining({ kind: "permit", category: "roofing" }));
  });

  it("applies the user's explicit choices: exclusions, price range, unticked adjacent permits", async () => {
    const a = answersSchema.parse({
      business_name: "Fence Co", sells: "Fence installation", job_value: "2k_10k", zips: ["44107"],
      never: { rentals: true, condos: true, price_min: 120000, price_max: 400000 }, adjacent: ["pool"],
    });
    const { recipe } = await buildRecipe(a, null);
    expect(recipe.default_exclusions).toMatchObject({ rentals: true, condos: true });
    expect(recipe.default_filters).toMatchObject({ price_min: 120000, price_max: 400000 });
    const permits = recipe.triggers.filter((t) => t.kind === "permit").map((t) => t.category);
    expect(permits).toEqual(["pool"]);
  });
});

describe("profile wizard, LLM path (fake provider)", () => {
  const answers = goldenAnswers(GOLDEN[0]!);
  const good = JSON.stringify({ ...getTemplate("roofing"), key: "storm_roofer", label: "Storm roofer", preset_base: "roofing", rationale: ["Old roofs fail first."] });

  it("uses a valid LLM recipe and still applies the user's choices", async () => {
    const llm = fake([`Here you go:\n\`\`\`json\n${good}\n\`\`\``]);
    const { recipe, via } = await buildRecipe({ ...answers, never: { ...answers.never, rentals: true } }, llm);
    expect(via).toBe("ai");
    expect(recipe.key).toBe("storm_roofer");
    expect(recipe.default_exclusions.rentals).toBe(true);
  });

  it("retries once on invalid output", async () => {
    const llm = fake([JSON.stringify({ ...JSON.parse(good), threshold: 99 }), good]);
    const { via } = await buildRecipe(answers, llm);
    expect(via).toBe("ai");
    expect(llm.calls).toBe(2);
  });

  it("falls back to the closest preset after two invalid replies, with no error", async () => {
    const llm = fake(["not json at all", JSON.stringify({ signals: { made_up: { weight: 10 } } })]);
    const { recipe, via } = await buildRecipe(answers, llm);
    expect(via).toBe("preset");
    expect(recipe.preset_base).toBe("roofing");
    expect(llm.calls).toBe(2);
  });

  it("falls back when the provider errors (network, refusal)", async () => {
    const llm = fake([new Error("connection reset")]);
    const { via } = await buildRecipe(answers, llm);
    expect(via).toBe("preset");
    expect(llm.calls).toBe(1);
  });

  it("tweak without an LLM uses the keyword rules and reports a diff", async () => {
    const { recipe: base } = await buildRecipe(answers, null);
    const t = await tweakRecipe(base, "fewer cheap homes", null);
    expect(t.understood).toBe(true);
    expect(t.recipe.default_filters.price_min).toBeGreaterThanOrEqual(150000);
    expect(recipeDiff(base, t.recipe).join(" ")).toMatch(/price min/);
    expect(keywordTweak(base, "make it purple").understood).toBe(false);
  });

  it("adjacent suggestions don't trip on look-alike words", () => {
    expect(suggestAdjacent("Family dentist: cleanings and checkups")).toEqual([]);
    expect(suggestAdjacent("Landscaping and yard cleanups")).toContain("new_build");
    expect(suggestAdjacent("House cleaning service")).toEqual(["remodel", "demolition"]);
    expect(suggestAdjacent("Concrete driveways and patios")).toContain("garage");
  });

  it("extracts JSON from a fenced reply", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
});

describe("preset path (spec 9.1 step 1)", () => {
  it("uses the picked trade as-is and never calls the LLM", async () => {
    const llm = fake(["should not be called"]);
    const a = answersSchema.parse({ business_name: "Tile Pick", sells: "Gutters", job_value: "2k_10k", zips: ["44107"], preset: "gutters" });
    const { recipe, via } = await buildRecipe(a, llm);
    expect(via).toBe("preset");
    expect(llm.calls).toBe(0);
    expect(recipe.preset_base).toBe("gutters");
    expect(recipe.triggers).toEqual(getTemplate("gutters").triggers);
  });

  it("refuses an unknown preset", () => {
    expect(answersSchema.safeParse({ business_name: "X Co", sells: "Stuff", job_value: "2k_10k", zips: ["44107"], preset: "nope" }).success).toBe(false);
  });
});

describe("OpenAI provider (A3 LLM_PROVIDER=openai)", () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("sends the system prompt and turns in JSON mode and returns the reply text", async () => {
    let sent: { url: string; body: { model: string; response_format: unknown; messages: { role: string }[] }; auth: string } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await openaiProvider("unit-key", "test-model", f).complete("SYSTEM", [{ role: "user", content: "hi" }]);
    expect(out).toBe('{"ok":true}');
    expect(sent!.url).toContain("/v1/chat/completions");
    expect(sent!.auth).toBe("Bearer unit-key");
    expect(sent!.body.model).toBe("test-model");
    expect(sent!.body.response_format).toEqual({ type: "json_object" });
    expect(sent!.body.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("turns API errors, refusals and cut-off replies into errors (so the preset fallback runs)", async () => {
    await expect(openaiProvider("k", "m", reply(401, { error: { message: "bad key" } })).complete("s", [])).rejects.toThrow(/401/);
    await expect(openaiProvider("k", "m", reply(200, { choices: [{ message: { refusal: "no" } }] })).complete("s", [])).rejects.toThrow(/refused/);
    await expect(openaiProvider("k", "m", reply(200, { choices: [{ message: { content: "{" }, finish_reason: "length" }] })).complete("s", [])).rejects.toThrow(/cut off/);
  });

  it("an OpenAI failure still ends on the closest preset with no user-facing error", async () => {
    const llm = openaiProvider("k", "m", reply(500, { error: { message: "down" } }));
    const answers = answersSchema.parse({ business_name: "Fence Co", sells: "Fences and decks", job_value: "2k_10k", zips: ["44107"] });
    const r = await buildRecipe(answers, llm);
    expect(r.via).toBe("preset");
  });
});
