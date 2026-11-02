"use client";
// ZIP-code territory picker. Live per-ZIP counts appear on the confirm screen; M4 adds town search.
import { useState } from "react";
import { Button, Input, Label } from "./ui";

export function TerritoryPicker({ zips, onChange, max = 25 }: { zips: string[]; onChange: (z: string[]) => void; max?: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const found = text.match(/\d{5}/g) ?? [];
    if (!found.length) return setError("Enter a 5-digit ZIP code");
    const next = [...new Set([...zips, ...found])].slice(0, max);
    onChange(next);
    setText("");
    setError(next.length === max && found.length + zips.length > max ? `Up to ${max} ZIP codes` : null);
  }

  return (
    <div>
      <Label htmlFor="zip">Where do you work?</Label>
      <p className="mb-2 text-sm text-slate">Add the ZIP codes you serve in Cuyahoga County. You can change these later.</p>
      <div className="flex gap-2">
        <Input id="zip" inputMode="numeric" placeholder="44107" value={text} aria-invalid={!!error}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }} />
        <Button type="button" variant="navy" onClick={add}>Add</Button>
      </div>
      {error ? <p role="alert" className="mt-1.5 text-sm text-lost">{error}</p> : null}
      {zips.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your ZIP codes">
          {zips.map((z) => (
            <li key={z} className="num inline-flex items-center gap-1 rounded-full bg-navy-50 py-1 pl-3 pr-1 text-sm font-semibold text-navy">
              {z}
              <button type="button" aria-label={`Remove ${z}`} onClick={() => onChange(zips.filter((x) => x !== z))}
                className="focus-ring grid h-7 w-7 place-items-center rounded-full text-slate hover:bg-white hover:text-navy">×</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
