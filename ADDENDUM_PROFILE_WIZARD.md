# Addendum A: AI Business Profile Wizard + Adjacent-Permit Triggers

Add-on to BUILD_SPEC.md. Everything in BUILD_SPEC.md stays as written; this only adds to it.
Product name: **216 Leads** (by 216LABS), served at 216labs.dev/leads. Use this name in all UI and copy.

## A1. Goal
Let any business that sells to homeowners (trades, plus dentists, insurance agents, cleaners, etc.) set up 216 Leads by answering plain questions. An LLM turns the answers into a scoring recipe in the existing template format (BUILD_SPEC 7.4). The 13 templates in 7.5 become **starting presets**, not the only options.

Out of scope: businesses that sell to other businesses (B2B). All data here is residential.

## A2. Wizard questions (onboarding step, replaces "pick your trade")
1. What do you sell, in a sentence? (free text)
2. What's a typical job or customer worth? (dropdown: <$500, $500-2K, $2-10K, $10K+)
3. Describe your best customer from the last year. (free text)
4. Who's a bad fit? (free text, optional)
5. Where do you work? (TerritoryPicker: towns/zips, existing component)
6. Who do you want first? (new movers / homes that need work soon / both)
7. Never show me: (checkboxes: rentals, condos, homes under $X, homes over $X, tax-delinquent)
8. Other projects that send you work? (adjacent permits, see A5. The LLM pre-suggests; user ticks.)

## A3. LLM output: the recipe
- Output is JSON matching the template schema in 7.4 (signals with weights, triggers, default_filters, default_exclusions, threshold, pitch), plus `preset_base` (closest of the 13 templates or `null`) and `rationale[]` (one plain sentence per chosen signal).
- **Validation:** zod schema. Signal keys must exist in the 7.2 signal library; categories must exist in 7.3; weights are integers 0-40; the threshold is 40-80. Reject and retry once on invalid output, then fall back to the closest preset.
- **The LLM never sees parcel data and never writes lead reasons.** Reasons still come only from the deterministic scoring engine (7.1), so every reason ties to a real record.
- Provider: env `LLM_PROVIDER` (anthropic | openai) + `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Put the prompt in `packages/scoring/profile/prompt.md`, with the signal library and category list injected from code so it can't drift.
- Cost: one call per build or tweak, a few cents [J].

## A4. Confirm screen
- Plain-English summary, for example: "We'll put homes bought in the last 90 days, built before 1970, $150K-400K, with no roof permit in 20 years, first. Skipping rentals and condos."
- Live count: "This finds N homes in your area this month" (run the scoring engine on the org's territory, not the LLM).
- 5 sample homes with their real reasons.
- A slider per signal (maps to the existing user multiplier `m` in 7.1).
- A "tweak it" text box ("fewer cheap homes", "more big lots"): it sends the current recipe + instruction to the LLM, which returns a new recipe; show a diff, and the user accepts.

## A5. Adjacent-permit triggers
A permit on a home for one kind of project signals demand for a different business.
- New trigger kind in 7.4: `{ kind: permit, category: <cat>, within_days: N, boost: B, label: "..." }`. It fires when **that same parcel** gets a permit in `<cat>` within N days (vs. `neighbor_job`, which looks at nearby parcels).
- Suggested defaults (the LLM proposes these, the user confirms):

| Business | Adjacent permit categories | Window |
|---|---|---|
| Fencing | pool, new_build | 0-90 days |
| Landscaping / lawn | new_build, remodel (additions), pool, demolition | 0-120 days |
| Gutters | roofing, siding | 0-60 days |
| Windows / doors | siding, remodel | 0-90 days |
| Electrical | pool, garage, remodel, hvac (heat pumps) | 0-60 days |
| Concrete / driveways | garage, new_build, demolition | 0-90 days |
| Painting | siding, remodel, windows | 0-90 days |
| Waterproofing | plumbing, foundation work | 0-60 days |
| Pest control | demolition (nearby), new_build | 0-60 days |
| Cleaning / junk removal | remodel, demolition | 0-60 days |

- Add one category to 7.3, placed before `remodel`: `new_build: '\b(new (single|two)?.?family|new dwelling|new construction|new home)\b'`. Pool, fence_deck, garage, remodel and the others already exist. Check the regexes against real Cleveland and Lake County permit descriptions in fixtures, and mark any category with fewer than 20 real matches as low-confidence in the UI. [S]

## A6. Data model additions
- `org_profile` (org_id, answers jsonb, created_at)
- `recipe_version` (id, org_id, recipe jsonb, source enum[wizard, tweak, slider, feedback, preset], parent_id, created_at, active bool). The scoring engine reads the active version, and the user can revert to any version in Settings.
- The 7.6 feedback loop keeps working unchanged; when it nudges weights, it writes a new `recipe_version` with source=feedback.

## A7. API
- `POST /api/profile/build` takes the answers and returns a recipe draft + preview (count, 5 samples)
- `POST /api/profile/tweak` takes a recipe + instruction and returns a recipe draft + diff + preview
- `POST /api/profile/activate` saves the draft as the active recipe_version

## A8. Tests and acceptance
- Golden tests for 6 business types (roofer, HVAC, fence company, landscaper, dentist, insurance agent): the recipe validates, includes the expected key signals and adjacent triggers, and finds at least 1 lead in the Cleveland test fixtures.
- The fence company recipe includes a pool permit trigger; the gutter recipe includes a roofing permit trigger.
- Invalid LLM output falls back to a preset with no user-facing error.

## A9. Milestone placement
Ship in M1 alongside the template onboarding: build the presets first, then the wizard on top. If time runs short, M1 can launch with presets and the wizard can follow in M2.
