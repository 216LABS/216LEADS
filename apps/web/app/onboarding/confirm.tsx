"use client";
// Confirm screen (Addendum A4): plain-English summary, a live count and 5 sample homes from the
// scoring engine, a slider per signal (user multiplier m), and "tweak it" with a diff. Also the
// spec 9.1 step 3 "perfect customer" controls, which edit the draft's filters and exclusions.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { customerLinesFromCsv, withBase } from "@216leads/shared";
import {
  applyCustomerControls, customerControls, HEAT, HOME_AGES, LOT_SIZES, PRICE_STOPS, signalLabel, type CustomerControls, type Template,
  type WizardAnswers,
} from "@216leads/scoring";
import { Badge, Button, Card, Input, SegmentedControl, Toggle } from "@/components/ui";
import { ScoreChip } from "@/components/lead-bits";

type Recipe = Template & { preset_base?: string | null };

export interface Draft {
  recipe: Recipe;
  via?: "ai" | "preset" | "rules";
  summary: string;
  count: number;
  zips: { zip: string; town: string; homes: number; matching: number }[];
  sample: { parcel_key: string; addr_line: string; city: string; zip: string; score: number; reasons: { label: string }[] }[];
}

const STOPS = [0, 0.5, 1, 1.5, 2];
const THIS_YEAR = new Date().getFullYear();
const k = (n: number) => (n >= 1_000_000 ? "$1M" : `$${Math.round(n / 1000)}K`);
const STOP_LABEL = ["Off", "Less", "Normal", "More", "Most"];

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(withBase(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}

export function Confirm({ answers, initial, onBack }: { answers: WizardAnswers; initial: Draft; onBack: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [m, setM] = useState<Record<string, number>>({});
  const [counting, setCounting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<(Draft & { diff: string[]; understood: boolean }) | null>(null);
  const [busy, setBusy] = useState<"tweak" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allSliders, setAllSliders] = useState(false);
  const [customers, setCustomers] = useState<{ file: string; lines: string[] } | null>(null);
  const [street, setStreet] = useState("");
  const c = customerControls(draft.recipe, THIS_YEAR);
  const setC = (patch: Partial<CustomerControls>) =>
    setDraft((d) => ({ ...d, recipe: applyCustomerControls(d.recipe, { ...customerControls(d.recipe, THIS_YEAR), ...patch }, THIS_YEAR) }));
  const keyOf = (mm: Record<string, number>, r: Recipe) => JSON.stringify([mm, r.default_filters, r.default_exclusions, r.signals]);
  const counted = useRef(keyOf({}, initial.recipe));

  // Re-count after a slider or control change (debounced 300 ms). Compares values so a repeated
  // effect run is a no-op.
  const countKey = keyOf(m, draft.recipe);
  useEffect(() => {
    if (countKey === counted.current) return;
    counted.current = countKey;
    setCounting(true);
    const t = setTimeout(() => {
      post<Omit<Draft, "recipe">>("/api/profile/preview", { recipe: draft.recipe, zips: answers.zips, multipliers: m })
        .then((p) => setDraft((d) => ({ ...d, ...p })))
        .catch((e) => setError(e.message))
        .finally(() => setCounting(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countKey]);

  async function tweak(e: React.FormEvent) {
    e.preventDefault();
    if (instruction.trim().length < 2) return;
    setBusy("tweak");
    setError(null);
    try {
      setProposal(await post("/api/profile/tweak", { recipe: draft.recipe, instruction, zips: answers.zips, multipliers: m }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not tweak it");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await post("/api/profile/activate", { recipe: draft.recipe, multipliers: m, answers, source: "wizard", customers: customers?.lines });
      router.replace("/onboarding/brand");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(null);
    }
  }

  const signals = Object.entries(draft.recipe.signals).filter(([, v]) => v.weight > 0).sort((a, b) => b[1].weight - a[1].weight);
  const last = PRICE_STOPS.length - 1;
  const lo = c.price_min === null ? 0 : Math.max(0, PRICE_STOPS.findIndex((p) => p >= c.price_min!));
  const hiIdx = c.price_max === null ? last : PRICE_STOPS.findIndex((p) => p >= c.price_max!);
  const hi = hiIdx < 0 ? last : hiIdx;
  const addStreet = () => {
    if (street.trim()) setC({ streets: [...c.streets, street] });
    setStreet("");
  };

  async function readCsv(file: File) {
    setCustomers({ file: file.name, lines: customerLinesFromCsv(await file.text()) });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-lg font-bold">Here&rsquo;s your list</h2>
        {draft.via === "preset" ? <Badge className="mt-1">Started from our {draft.recipe.label} preset</Badge> : null}
        <p className="mt-2 text-sm text-slate">{draft.summary}</p>
        <p className="mt-4" aria-live="polite">
          <span className="num text-3xl font-bold text-signal-600">{draft.count.toLocaleString("en-US")}</span>{" "}
          <span className="text-sm text-slate">{counting ? "counting…" : `homes in your area match right now`}</span>
        </p>
        {draft.zips.length > 1 ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
            {draft.zips.map((z) => <li key={z.zip}><span className="num font-semibold text-navy">{z.zip}</span> {z.town}: {z.matching.toLocaleString("en-US")}</li>)}
          </ul>
        ) : null}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-bold">5 homes from your list</h3>
        {draft.sample.length ? (
          <ul className="divide-y divide-line">
            {draft.sample.map((h) => (
              <li key={h.parcel_key} className="flex gap-3 py-3">
                <ScoreChip score={h.score} />
                <div className="min-w-0">
                  <div className="font-semibold">{h.addr_line}</div>
                  <div className="text-xs text-slate">{h.city} {h.zip}</div>
                  <ul className="mt-1 text-sm text-slate">{h.reasons.map((r, i) => <li key={i}>• {r.label}</li>)}</ul>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate">No homes match yet. Try moving a slider up, or tweak it below.</p>}
      </Card>

      <Card className="space-y-5 p-5">
        <h3 className="font-bold">Your perfect customer</h3>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-navy">Home age</span>
          <SegmentedControl label="Home age" value={c.age} options={[...HOME_AGES]} onChange={(age) => setC({ age })} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-semibold text-navy">Home value</span>
            <span className="num text-slate">{lo === 0 ? "Any" : k(PRICE_STOPS[lo]!)} to {hi === last ? "$1M+" : k(PRICE_STOPS[hi]!)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="range" aria-label="Lowest home value" min={0} max={last} value={lo} className="accent-[#0F2A44]"
              onChange={(e) => {
                const i = Math.min(Number(e.target.value), hi - 1);
                setC({ price_min: i <= 0 ? null : PRICE_STOPS[i]! });
              }} />
            <input type="range" aria-label="Highest home value" min={0} max={last} value={hi} className="accent-[#0F2A44]"
              onChange={(e) => {
                const i = Math.max(Number(e.target.value), lo + 1);
                setC({ price_max: i >= last ? null : PRICE_STOPS[i]! });
              }} />
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-navy">Lot size</span>
          <SegmentedControl label="Lot size" value={c.lot} options={[...LOT_SIZES]} onChange={(lot) => setC({ lot })} />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-navy">Heat</span>
          <SegmentedControl label="Heat" value={c.heat} options={[...HEAT]} onChange={(heat) => setC({ heat })} />
        </div>
        <Toggle label="Owner-occupied only" checked={c.owner_occupied} onChange={(owner_occupied) => setC({ owner_occupied })} />
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-semibold text-navy">Leave out</legend>
          <Toggle label="Rentals" checked={c.rentals} onChange={(rentals) => setC({ rentals })} />
          <Toggle label="Condos" checked={c.condos} onChange={(condos) => setC({ condos })} />
          <div>
            <label htmlFor="street" className="mb-1 block text-sm text-slate">Streets you don&rsquo;t work on</label>
            <div className="flex gap-2">
              <Input id="street" value={street} placeholder="W 117th St" maxLength={80} onChange={(e) => setStreet(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStreet();
                  }
                }} />
              <Button type="button" variant="secondary" onClick={addStreet}>Add</Button>
            </div>
            {c.streets.length ? (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Streets left out">
                {c.streets.map((st) => (
                  <li key={st} className="inline-flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 pr-1 text-sm text-navy">
                    {st}
                    <button type="button" aria-label={`Put back ${st}`} onClick={() => setC({ streets: c.streets.filter((x) => x !== st) })}
                      className="focus-ring grid h-7 w-7 place-items-center rounded-full text-slate hover:bg-white">×</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <label htmlFor="customers" className="mb-1 block text-sm text-slate">
              Your current customers (a CSV with addresses). We hide these homes. Only street and ZIP leave your device.
            </label>
            <input id="customers" type="file" accept=".csv,text/csv,.txt" className="block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readCsv(f);
              }} />
            {customers ? (
              <p className="mt-1 text-sm text-slate" role="status">
                {customers.lines.length
                  ? `${customers.lines.length.toLocaleString("en-US")} addresses read from ${customers.file}. They'll be hidden once you confirm.`
                  : `No street addresses with ZIP codes found in ${customers.file}.`}
              </p>
            ) : null}
          </div>
        </fieldset>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-bold">What matters most</h3>
        <ul className="space-y-4">
          {(allSliders ? signals : signals.slice(0, 3)).map(([key]) => {
            const i = STOPS.indexOf(m[key] ?? 1);
            return (
              <li key={key}>
                <label className="flex justify-between text-sm" htmlFor={`s-${key}`}>
                  <span className="font-semibold">{signalLabel(key)}</span>
                  <span className="text-slate">{STOP_LABEL[i]}</span>
                </label>
                <input id={`s-${key}`} type="range" min={0} max={4} step={1} value={i} className="mt-1 w-full accent-[#F26B1D]"
                  onChange={(e) => setM((x) => ({ ...x, [key]: STOPS[Number(e.target.value)]! }))} />
              </li>
            );
          })}
        </ul>
        {signals.length > 3 ? (
          <button type="button" className="focus-ring mt-3 text-sm font-semibold text-navy underline" onClick={() => setAllSliders((v) => !v)}>
            {allSliders ? "Show fewer" : `Show all ${signals.length}`}
          </button>
        ) : null}
      </Card>

      <Card className="p-5">
        <form onSubmit={tweak}>
          <label htmlFor="tweak" className="mb-1.5 block font-bold">Tweak it</label>
          <div className="flex gap-2">
            <Input id="tweak" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="fewer cheap homes, more big lots" maxLength={300} />
            <Button type="submit" variant="navy" disabled={busy !== null}>{busy === "tweak" ? "Thinking…" : "Tweak"}</Button>
          </div>
        </form>
        {proposal ? (
          <div className="mt-4 rounded-[10px] bg-navy-50 p-4 text-sm">
            {proposal.diff.length ? (
              <>
                <p className="font-semibold">Proposed changes ({proposal.count.toLocaleString("en-US")} homes):</p>
                <ul className="mt-1 list-disc pl-5">{proposal.diff.map((d, i) => <li key={i}>{d}</li>)}</ul>
                <div className="mt-3 flex gap-2">
                  <Button type="button" onClick={() => { setDraft(proposal); setProposal(null); setInstruction(""); }}>Use this</Button>
                  <Button type="button" variant="secondary" onClick={() => setProposal(null)}>Keep mine</Button>
                </div>
              </>
            ) : (
              <p>We couldn&rsquo;t turn that into a change. Try something like &ldquo;fewer cheap homes&rdquo;, &ldquo;more big lots&rdquo; or &ldquo;skip rentals&rdquo;.</p>
            )}
          </div>
        ) : null}
      </Card>

      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack} disabled={busy === "save"}>Change answers</Button>
        <Button type="button" className="flex-1" onClick={save} disabled={busy !== null}>
          {busy === "save" ? "Scoring your homes…" : "Looks good, show my leads"}
        </Button>
      </div>
    </div>
  );
}
