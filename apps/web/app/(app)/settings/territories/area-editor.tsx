"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card } from "@/components/ui";
import { TerritoryPicker } from "@/components/territory-picker";

export function AreaEditor({ zips: initial, exclusive: initialExclusive, exclusiveMax, trade, tradeLabel, canEdit, max }: {
  zips: string[]; exclusive: string[]; exclusiveMax: number; trade: string; tradeLabel: string; canEdit: boolean; max: number;
}) {
  const router = useRouter();
  const [zips, setZips] = useState(initial);
  const [exclusive, setExclusive] = useState(initialExclusive);
  const [taken, setTaken] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const held = exclusive.filter((z) => zips.includes(z));
  const dirty = zips.join(",") !== initial.join(",") || held.join(",") !== initialExclusive.join(",");

  function toggle(z: string) {
    setExclusive((e) => (e.includes(z) ? e.filter((x) => x !== z) : [...e, z].sort()));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = exclusiveMax > 0 ? { zips, exclusive: held } : { zips };
    const res = await fetch(withBase("/api/settings/territories"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) setTaken(data.taken ?? []);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Could not save" });
    setTaken([]);
    setMsg({ ok: true, text: `Saved. ${Number(data.leads ?? 0).toLocaleString("en-US")} homes on your list.` });
    router.refresh();
  }

  return (
    <Card className="space-y-4 p-5">
      <TerritoryPicker zips={zips} onChange={canEdit ? setZips : () => undefined} trade={trade} tradeLabel={tradeLabel} max={max} showAvailable={exclusiveMax > 0} />
      <p className="text-xs text-slate">Your plan covers up to {max} ZIP codes.</p>
      {exclusiveMax > 0 && zips.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-navy">Exclusive ZIP codes ({held.length} of {exclusiveMax})</legend>
          <p className="text-xs text-slate">No other {tradeLabel} business on 216 HomeSignal gets these homes. Others in a ZIP you hold see new homes 72 hours after you.</p>
          <ul className="flex flex-wrap gap-2">
            {zips.map((z) => {
              const on = held.includes(z);
              return (
                <li key={z}>
                  <button type="button" aria-pressed={on} disabled={!canEdit || (!on && held.length >= exclusiveMax)} onClick={() => toggle(z)}
                    className={`focus-ring rounded-full border px-3 py-1 text-sm ${on ? "border-navy bg-navy text-white" : "border-line text-navy"} ${taken.includes(z) ? "border-lost text-lost" : ""} disabled:opacity-50`}>
                    <span className="num">{z}</span> {on ? "Exclusive" : taken.includes(z) ? "Taken" : "Make exclusive"}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}
      {!canEdit ? <p className="text-sm text-slate">Only the account owner can change the area.</p> : null}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={!canEdit || !dirty || !zips.length || busy}>{busy ? "Re-scoring…" : "Save area"}</Button>
        {msg ? <p className={msg.ok ? "text-sm text-won" : "text-sm text-lost"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null}
      </div>
    </Card>
  );
}
