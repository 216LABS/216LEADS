"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { countOf, withBase } from "@216leads/shared";
import { signalLabel, type Template } from "@216leads/scoring";
import { Button, Card } from "@/components/ui";
import { CustomerControlsCard } from "@/components/customer-controls";

const STOPS = [0, 0.5, 1, 1.5, 2];
const STOP_LABEL = ["Off", "Less", "Normal", "More", "Most"];

export function ProfileEditor({ recipe: initial, multipliers, versionId, zips }: {
  recipe: Template; multipliers: Record<string, number>; versionId: string; zips: string[];
}) {
  const router = useRouter();
  const [recipe, setRecipe] = useState(initial);
  const [m, setM] = useState(multipliers);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const keyOf = (r: Template, mm: Record<string, number>) => JSON.stringify([r.default_filters, r.default_exclusions, r.signals, mm]);
  const saved = useRef(keyOf(initial, multipliers));
  const counted = useRef("");
  const key = keyOf(recipe, m);
  const dirty = key !== saved.current;

  // Live count of matching homes (debounced 300 ms).
  useEffect(() => {
    if (!zips.length || key === counted.current) return;
    counted.current = key;
    const t = setTimeout(() => {
      fetch(withBase("/api/profile/preview"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe, zips, multipliers: m }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { count: number } | null) => setCount(d ? d.count : null))
        .catch(() => setCount(null));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(withBase("/api/profile/activate"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe, multipliers: m, source: "slider", parent_id: versionId, note: "Homes you want settings" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Could not save" });
    saved.current = key;
    setMsg({ ok: true, text: `Saved. ${countOf(Number(data.leads ?? 0), "home")} on your list.` });
    router.refresh();
  }

  const signals = Object.entries(recipe.signals).filter(([, v]) => v.weight > 0).sort((a, b) => b[1].weight - a[1].weight);

  return (
    <div className="space-y-4">
      <CustomerControlsCard recipe={recipe} onChange={setRecipe} />
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">What matters most</h2>
        <ul className="space-y-4">
          {signals.map(([k]) => {
            const i = Math.max(0, STOPS.indexOf(m[k] ?? 1));
            return (
              <li key={k}>
                <label className="flex justify-between text-sm" htmlFor={`s-${k}`}>
                  <span className="font-semibold">{signalLabel(k)}</span>
                  <span className="text-slate">{STOP_LABEL[i]}</span>
                </label>
                <input id={`s-${k}`} type="range" min={0} max={4} step={1} value={i} className="mt-1 w-full accent-signal"
                  onChange={(e) => setM((x) => ({ ...x, [k]: STOPS[Number(e.target.value)]! }))} />
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-[12px] border border-line bg-white p-3 shadow md:bottom-4">
        <p className="flex-1 text-sm" aria-live="polite">
          {count === null ? <span className="text-slate">Counting homes…</span> : <><span className="num font-semibold">{count.toLocaleString("en-US")}</span> homes match</>}
          {msg ? <span className={msg.ok ? "ml-2 text-won" : "ml-2 text-lost"} role={msg.ok ? "status" : "alert"}>{msg.text}</span> : null}
        </p>
        <Button type="button" onClick={() => void save()} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
