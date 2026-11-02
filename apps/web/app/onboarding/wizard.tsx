"use client";
// Onboarding wizard (Addendum A2): plain questions instead of "pick your trade". The answers go
// to /api/profile/build, which returns a recipe draft for the confirm screen. Users who skip the
// questions pick a trade tile instead (spec 9.1 step 1) and go straight to the area step.
import clsx from "clsx";
import { useState } from "react";
import { TRIAL, withBase } from "@216leads/shared";
import { ADJACENT_CHOICES, CATEGORY_NOUN, closestPreset, FOCUS, JOB_VALUES, suggestAdjacent, TEMPLATES, type WizardAnswers } from "@216leads/scoring";
import { Button, Input, Label, SegmentedControl, Textarea, Toggle } from "@/components/ui";
import { TerritoryPicker } from "@/components/territory-picker";
import { Confirm, type Draft } from "./confirm";

const AI_STEPS = ["Your business", "Your customers", "Where you work", "Who comes first"];
const PRESET_STEPS = ["Your trade", "Where you work"];
/** Trade tiles: every preset except the catch-all for non-trades. */
const TILES = Object.values(TEMPLATES).filter((t) => t.key !== "new_movers").sort((x, y) => x.label.localeCompare(y.label));

const blank: WizardAnswers = {
  business_name: "", sells: "", job_value: "2k_10k", best_customer: "", bad_fit: "", zips: [], focus: "both",
  never: { rentals: false, condos: false, tax_delinquent: false, price_min: null, price_max: null }, adjacent: [],
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dollars = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0)));

/** A free-list link (issue #6) opens signup with the trade and ZIPs filled in. */
export interface WizardPrefill { trade: string; zips: string[]; ref: string | null }

export function Wizard({ prefill }: { prefill?: WizardPrefill | null }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"ai" | "preset">(prefill ? "preset" : "ai");
  const STEPS = mode === "ai" ? AI_STEPS : PRESET_STEPS;
  const zipStep = mode === "ai" ? 2 : 1;
  const [a, setA] = useState<WizardAnswers>(prefill
    ? { ...blank, preset: prefill.trade, sells: TEMPLATES[prefill.trade]?.label ?? prefill.trade, zips: prefill.zips.slice(0, TRIAL.maxZips) }
    : blank);
  const [adjacentTouched, setAdjacentTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const trade = a.preset ?? closestPreset(`${a.sells} ${a.best_customer}`);
  const set = (patch: Partial<WizardAnswers>) => setA((x) => ({ ...x, ...patch }));
  const never = (patch: Partial<WizardAnswers["never"]>) => setA((x) => ({ ...x, never: { ...x.never, ...patch } }));

  const canNext = mode === "ai"
    ? [a.business_name.trim().length >= 2 && a.sells.trim().length >= 3, true, a.zips.length > 0, true][step]
    : [a.business_name.trim().length >= 2 && !!a.preset, a.zips.length > 0][step];

  function switchMode(m: "ai" | "preset") {
    setMode(m);
    setStep(0);
    setError(null);
    if (m === "ai") set({ preset: undefined });
  }

  function next() {
    // Pre-tick the adjacent permits from the A5 table once the user reaches that question.
    if (mode === "ai" && step === 2 && !adjacentTouched) set({ adjacent: suggestAdjacent(`${a.sells} ${a.best_customer}`) });
    setStep((s) => s + 1);
  }

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase("/api/profile/build"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a.preset ? { ...a, adjacent: [] } : a),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build your list");
      setDraft(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build your list");
    } finally {
      setBusy(false);
    }
  }

  if (draft) return <Confirm answers={a} initial={draft} onBack={() => setDraft(null)} refToken={prefill?.ref} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canNext) return;
        if (step < STEPS.length - 1) next();
        else void build();
      }}
    >
      <ol className="mb-6 flex gap-1.5" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className={clsx("h-1.5 flex-1 rounded-full", i <= step ? "bg-signal" : "bg-line")} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>
      <h2 className="mb-4 text-lg font-bold">{STEPS[step]}</h2>

      <div className="card space-y-5 p-5">
        {mode === "preset" && step === 0 ? (
          <>
            <div>
              <Label htmlFor="business_name">Business name</Label>
              <Input id="business_name" value={a.business_name} onChange={(e) => set({ business_name: e.target.value })} autoComplete="organization" required />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-navy">Your trade</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TILES.map((t) => {
                  const on = a.preset === t.key;
                  return (
                    <button key={t.key} type="button" aria-pressed={on} onClick={() => set({ preset: t.key, sells: t.label })}
                      className={clsx("focus-ring min-h-[56px] rounded-[12px] border px-3 text-left text-sm font-semibold",
                        on ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy")}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : null}

        {mode === "ai" && step === 0 ? (
          <>
            <div>
              <Label htmlFor="business_name">Business name</Label>
              <Input id="business_name" value={a.business_name} onChange={(e) => set({ business_name: e.target.value })} autoComplete="organization" required />
            </div>
            <div>
              <Label htmlFor="sells">What do you sell, in a sentence?</Label>
              <Textarea id="sells" rows={2} value={a.sells} onChange={(e) => set({ sells: e.target.value })} placeholder="Roof replacements and repairs for older homes" required />
            </div>
            <div>
              <Label htmlFor="job_value">What&rsquo;s a typical job or customer worth?</Label>
              <select id="job_value" value={a.job_value} onChange={(e) => set({ job_value: e.target.value as WizardAnswers["job_value"] })}
                className="tap focus-ring w-full rounded-[10px] border border-line bg-white px-3 text-base text-navy">
                {JOB_VALUES.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
          </>
        ) : null}

        {mode === "ai" && step === 1 ? (
          <>
            <div>
              <Label htmlFor="best_customer">Describe your best customer from the last year.</Label>
              <Textarea id="best_customer" rows={3} value={a.best_customer} onChange={(e) => set({ best_customer: e.target.value })}
                placeholder="Couple who just bought a 1950s colonial and wanted the roof done before winter" />
            </div>
            <div>
              <Label htmlFor="bad_fit" hint="optional">Who&rsquo;s a bad fit?</Label>
              <Textarea id="bad_fit" rows={2} value={a.bad_fit} onChange={(e) => set({ bad_fit: e.target.value })} placeholder="Landlords shopping for the cheapest bid" />
            </div>
          </>
        ) : null}

        {step === zipStep ? (
          <TerritoryPicker zips={a.zips} onChange={(zips) => set({ zips })} trade={trade} tradeLabel={TEMPLATES[trade]?.label.toLowerCase()} max={TRIAL.maxZips} />
        ) : null}

        {mode === "ai" && step === 3 ? (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-navy">Who do you want first?</span>
              <SegmentedControl label="Who do you want first?" value={a.focus} options={[...FOCUS]} onChange={(focus) => set({ focus })} />
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-1.5 text-sm font-semibold text-navy">Never show me</legend>
              <Toggle label="Rentals" checked={a.never.rentals} onChange={(rentals) => never({ rentals })} />
              <Toggle label="Condos" checked={a.never.condos} onChange={(condos) => never({ condos })} />
              <Toggle label="Tax-delinquent homes" checked={a.never.tax_delinquent} onChange={(tax_delinquent) => never({ tax_delinquent })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="price_min">Homes under $</Label>
                  <Input id="price_min" inputMode="numeric" placeholder="none" value={a.never.price_min ?? ""} onChange={(e) => never({ price_min: dollars(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="price_max">Homes over $</Label>
                  <Input id="price_max" inputMode="numeric" placeholder="none" value={a.never.price_max ?? ""} onChange={(e) => never({ price_max: dollars(e.target.value) })} />
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-navy">Other projects that send you work?</legend>
              <p className="mb-2 text-sm text-slate">A permit for one of these on a home moves it up your list. We ticked the usual ones for your business.</p>
              <div className="flex flex-wrap gap-2">
                {ADJACENT_CHOICES.map((c) => {
                  const on = a.adjacent.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on}
                      onClick={() => {
                        setAdjacentTouched(true);
                        set({ adjacent: on ? a.adjacent.filter((x) => x !== c) : [...a.adjacent, c] });
                      }}
                      className={clsx("focus-ring min-h-[40px] rounded-full border px-3 text-sm font-semibold",
                        on ? "border-navy bg-navy text-white" : "border-line bg-white text-slate hover:text-navy")}>
                      {capital(CATEGORY_NOUN[c] ?? c)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : null}
      </div>

      {step === 0 ? (
        <p className="mt-3 text-center text-sm text-slate">
          {mode === "ai" ? (
            <button type="button" className="focus-ring font-semibold text-navy underline" onClick={() => switchMode("preset")}>Skip the questions and pick your trade</button>
          ) : (
            <button type="button" className="focus-ring font-semibold text-navy underline" onClick={() => switchMode("ai")}>Answer a few questions instead</button>
          )}
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-lost">{error}</p> : null}
      <div className="mt-5 flex gap-3">
        {step > 0 ? <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button> : null}
        <Button type="submit" className="flex-1" disabled={!canNext || busy}>
          {step < STEPS.length - 1 ? "Next" : busy ? "Building your list…" : "Build my list"}
        </Button>
      </div>
    </form>
  );
}
