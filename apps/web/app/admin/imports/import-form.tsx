"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label, Select } from "@/components/ui";

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "date", label: "Issue date", required: true }, { key: "address", label: "Street address" }, { key: "zip", label: "ZIP" },
  { key: "parcel", label: "Parcel number" }, { key: "type", label: "Permit type" }, { key: "description", label: "Description" },
  { key: "value", label: "Value / cost" }, { key: "contractor", label: "Contractor" }, { key: "id", label: "Permit number" },
];
const COUNTIES = ["cuyahoga", "lake", "medina", "stark", "summit"];

interface Preview { source: string; headers: string[]; blocked: boolean[]; rows: number; sample: string[][]; saved: Record<string, string> | null }

export function ImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("cuyahoga");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const form = () => {
    const f = new FormData();
    f.append("file", file!);
    f.append("city", city);
    f.append("county", county);
    return f;
  };

  async function load() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(withBase("/api/admin/imports/preview"), { method: "POST", body: form() });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? "Could not read the file" });
    setPreview(d);
    // Start from the city's saved mapping, then guess by header name.
    const guess: Record<string, string> = {};
    for (const f of FIELDS) {
      const saved = d.saved?.[f.key];
      if (saved && d.headers.includes(saved)) guess[f.key] = saved;
      else {
        const i = (d.headers as string[]).findIndex((h, j) => !d.blocked[j] && new RegExp(f.key === "id" ? "permit\s*(no|num|#)" : f.key === "value" ? "value|cost|valuation" : f.key, "i").test(h));
        if (i >= 0) guess[f.key] = d.headers[i];
      }
    }
    setMapping(guess);
  }

  async function commit() {
    setBusy(true);
    setMsg(null);
    const f = form();
    f.append("mapping", JSON.stringify(mapping));
    const res = await fetch(withBase("/api/admin/imports/commit"), { method: "POST", body: f });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: d.error ?? "Import failed" });
    setMsg({ ok: true, text: `Imported ${d.rows} permits: ${d.matched} matched to a home, ${d.unmatched} unmatched (see Unmatched), ${d.skippedNoDate} without a date skipped.` });
    router.refresh();
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="rr-file">File</Label>
          <Input id="rr-file" type="file" accept=".csv,.xlsx,.pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
        </div>
        <div>
          <Label htmlFor="rr-city">City or township</Label>
          <Input id="rr-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Parma" />
        </div>
        <div>
          <Label htmlFor="rr-county">County</Label>
          <Select id="rr-county" value={county} onChange={(e) => setCounty(e.target.value)}>
            {COUNTIES.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
          </Select>
        </div>
      </div>
      <Button type="button" variant="navy" onClick={() => void load()} disabled={!file || !city.trim() || busy}>{busy && !preview ? "Reading…" : "Read file"}</Button>

      {preview ? (
        <>
          <p className="text-sm text-slate">{preview.rows.toLocaleString("en-US")} rows · source <code>{preview.source}</code></p>
          <div className="grid gap-3 md:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`map-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
                <Select id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">Not in this file</option>
                  {preview.headers.map((h, i) => <option key={h} value={h} disabled={preview.blocked[i]}>{h}{preview.blocked[i] ? " (owner data, not allowed)" : ""}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr>{preview.headers.map((h) => <th key={h} className="whitespace-nowrap border-b border-line px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{preview.sample.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap border-b border-line px-2 py-1 text-slate">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <Button type="button" onClick={() => void commit()} disabled={busy || !mapping.date || (!mapping.address && !mapping.parcel)}>{busy ? "Importing…" : "Import"}</Button>
        </>
      ) : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-won" : "text-sm text-lost"}>{msg.text}</p> : null}
    </Card>
  );
}
