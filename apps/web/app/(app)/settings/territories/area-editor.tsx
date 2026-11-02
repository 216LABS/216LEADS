"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card } from "@/components/ui";
import { TerritoryPicker } from "@/components/territory-picker";

export function AreaEditor({ zips: initial, trade, tradeLabel, canEdit }: { zips: string[]; trade: string; tradeLabel: string; canEdit: boolean }) {
  const router = useRouter();
  const [zips, setZips] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = zips.join(",") !== initial.join(",");

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(withBase("/api/settings/territories"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zips }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Could not save" });
    setMsg({ ok: true, text: `Saved. ${Number(data.leads ?? 0).toLocaleString("en-US")} homes on your list.` });
    router.refresh();
  }

  return (
    <Card className="space-y-4 p-5">
      <TerritoryPicker zips={zips} onChange={canEdit ? setZips : () => undefined} trade={trade} tradeLabel={tradeLabel} />
      {!canEdit ? <p className="text-sm text-slate">Only the account owner can change the area.</p> : null}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={!canEdit || !dirty || !zips.length || busy}>{busy ? "Re-scoring…" : "Save area"}</Button>
        {msg ? <p className={msg.ok ? "text-sm text-won" : "text-sm text-lost"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null}
      </div>
    </Card>
  );
}
