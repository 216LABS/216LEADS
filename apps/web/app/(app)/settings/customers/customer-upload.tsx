"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { customerLinesFromCsv, withBase } from "@216leads/shared";
import { Card } from "@/components/ui";

export function CustomerUpload({ saved, matched }: { saved: number; matched: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setMsg(null);
    const lines = customerLinesFromCsv(await file.text());
    if (!lines.length) return setMsg({ ok: false, text: `No street addresses with ZIP codes found in ${file.name}.` });
    setBusy(true);
    const res = await fetch(withBase("/api/settings/suppression/upload"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Could not upload" });
    setMsg({ ok: true, text: `${Number(data.saved).toLocaleString("en-US")} addresses saved, ${Number(data.matched).toLocaleString("en-US")} matched to a home we know.` });
    router.refresh();
  }

  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm"><span className="num font-semibold">{saved.toLocaleString("en-US")}</span> addresses on your list ({matched.toLocaleString("en-US")} matched to a home).</p>
      <label htmlFor="csv" className="block text-sm text-slate">
        Upload a CSV with an address column and a ZIP column (any other columns are ignored). Only street and ZIP leave your device.
      </label>
      <input id="csv" type="file" accept=".csv,text/csv,.txt" disabled={busy} className="block w-full text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }} />
      {busy ? <p className="text-sm text-slate" role="status">Saving and re-scoring…</p> : null}
      {msg ? <p className={msg.ok ? "text-sm text-won" : "text-sm text-lost"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null}
    </Card>
  );
}
