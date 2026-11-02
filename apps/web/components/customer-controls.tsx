"use client";
// Spec 9.1 step 3 "Your perfect customer": home age, value, lot, heat, owner-occupied and
// exclusions, read from and written to a recipe draft. Used by onboarding and Settings.
import { useState, type ReactNode } from "react";
import { applyCustomerControls, customerControls, HEAT, HOME_AGES, LOT_SIZES, PRICE_STOPS, type CustomerControls, type Template } from "@216leads/scoring";
import { Button, Card, Input, SegmentedControl, Toggle } from "./ui";

const THIS_YEAR = new Date().getFullYear();
const k = (n: number) => (n >= 1_000_000 ? "$1M" : `$${Math.round(n / 1000)}K`);

export function CustomerControlsCard<T extends Template>({ recipe, onChange, children }: { recipe: T; onChange: (r: T) => void; children?: ReactNode }) {
  const [street, setStreet] = useState("");
  const c = customerControls(recipe, THIS_YEAR);
  const setC = (patch: Partial<CustomerControls>) => onChange(applyCustomerControls(recipe, { ...c, ...patch }, THIS_YEAR));
  const last = PRICE_STOPS.length - 1;
  const lo = c.price_min === null ? 0 : Math.max(0, PRICE_STOPS.findIndex((p) => p >= c.price_min!));
  const hiIdx = c.price_max === null ? last : PRICE_STOPS.findIndex((p) => p >= c.price_max!);
  const hi = hiIdx < 0 ? last : hiIdx;
  const addStreet = () => {
    if (street.trim()) setC({ streets: [...c.streets, street] });
    setStreet("");
  };

  return (
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
        {children}
      </fieldset>
    </Card>
  );
}
