"use client";
// Area picker (spec 9.1 step 2): type a ZIP or a town, each chip shows a live count for the
// trade ("44107 Lakewood: 214 homes match") and "Taken" when another org holds the zip exclusively.
import { useEffect, useRef, useState } from "react";
import { withBase } from "@216leads/shared";
import { Button, Input, Label } from "./ui";

interface Match { kind: "zip" | "town"; label: string; zips: string[]; homes: number }
interface Count { zip: string; town: string; matching: number; taken: boolean }

export function TerritoryPicker({ zips, onChange, trade, tradeLabel, max = 25 }: {
  zips: string[]; onChange: (z: string[]) => void; trade?: string; tradeLabel?: string; max?: number;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [counts, setCounts] = useState<Record<string, Count>>({});
  const [counting, setCounting] = useState(false);
  const counted = useRef("");

  // Type-ahead (debounced).
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 && !/^\d$/.test(q)) return setMatches([]);
    const t = setTimeout(() => {
      fetch(withBase(`/api/territory/search?q=${encodeURIComponent(q)}`))
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((d: { matches: Match[] }) => setMatches(d.matches))
        .catch(() => setMatches([]));
    }, 200);
    return () => clearTimeout(t);
  }, [text]);

  // Live counts for the chips (debounced 300 ms, skipped when nothing changed).
  useEffect(() => {
    const key = `${trade}|${zips.join(",")}`;
    if (!trade || !zips.length || key === counted.current) return;
    counted.current = key;
    setCounting(true);
    const t = setTimeout(() => {
      fetch(withBase("/api/territory/counts"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trade, zips }) })
        .then((r) => (r.ok ? r.json() : { zips: [] }))
        .then((d: { zips: Count[] }) => setCounts((c) => ({ ...c, ...Object.fromEntries(d.zips.map((z) => [z.zip, z])) })))
        .catch(() => undefined)
        .finally(() => setCounting(false));
    }, 300);
    return () => clearTimeout(t);
  }, [trade, zips]);

  function addZips(found: string[]) {
    const next = [...new Set([...zips, ...found])].slice(0, max);
    onChange(next);
    setText("");
    setMatches([]);
    setError(found.length + zips.length > max ? `Up to ${max} ZIP codes` : null);
  }

  function add() {
    const found = text.match(/\d{5}/g) ?? [];
    if (found.length) return addZips(found);
    if (matches[0]) return addZips(matches[0].zips);
    setError("Enter a 5-digit ZIP code or a town name");
  }

  return (
    <div>
      <Label htmlFor="area">Where do you work?</Label>
      <p className="mb-2 text-sm text-slate">Type ZIP codes or towns in Cuyahoga County. You can change these later.</p>
      <div className="relative">
        <div className="flex gap-2">
          <Input id="area" placeholder="44107 or Lakewood" value={text} aria-invalid={!!error} autoComplete="off"
            role="combobox" aria-expanded={matches.length > 0} aria-controls="area-matches"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }} />
          <Button type="button" variant="navy" onClick={add}>Add</Button>
        </div>
        {matches.length ? (
          <ul id="area-matches" role="listbox" className="absolute z-10 mt-1 w-full overflow-hidden rounded-[10px] border border-line bg-white shadow-lg">
            {matches.map((m) => (
              <li key={`${m.kind}-${m.label}`} role="option" aria-selected={false}>
                <button type="button" onClick={() => addZips(m.zips)} className="focus-ring flex w-full justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-navy-50">
                  <span className="font-semibold text-navy">{m.label}</span>
                  <span className="text-slate">
                    {m.kind === "town" ? `${m.zips.length} ZIP${m.zips.length === 1 ? "" : "s"}, ` : ""}{m.homes.toLocaleString("en-US")} homes
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-1.5 text-sm text-lost">{error}</p> : null}
      {zips.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your ZIP codes" aria-busy={counting}>
          {zips.map((z) => {
            const c = counts[z];
            return (
              <li key={z} className="inline-flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 pr-1 text-sm text-navy">
                <span><span className="num font-semibold">{z}</span>{c?.town ? ` ${c.town}` : ""}</span>
                {c ? <span className="text-slate">: {c.matching.toLocaleString("en-US")} homes match</span> : null}
                {c?.taken ? <span className="ml-1 rounded-full bg-lost/10 px-2 text-xs font-semibold text-lost">Taken for {tradeLabel ?? "your trade"}</span> : null}
                <button type="button" aria-label={`Remove ${z}`} onClick={() => onChange(zips.filter((x) => x !== z))}
                  className="focus-ring grid h-7 w-7 place-items-center rounded-full text-slate hover:bg-white hover:text-navy">×</button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
