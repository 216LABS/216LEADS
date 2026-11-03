"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { countOf, withBase } from "@216leads/shared";
import { Button, Card, Input, Label, Select } from "@/components/ui";

export function ProspectListForm({ trades }: { trades: { key: string; label: string }[] }) {
  const router = useRouter();
  const [business, setBusiness] = useState("");
  const [trade, setTrade] = useState("roofing");
  const [zips, setZips] = useState("");
  const [perZip, setPerZip] = useState(25);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ link: string; csv: string; homes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zipList = [...new Set(zips.match(/\d{5}/g) ?? [])].slice(0, 3);

  async function make() {
    setBusy(true);
    setError(null);
    setOut(null);
    const res = await fetch(withBase("/api/admin/prospect-lists"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business, trade, zips: zipList, per_zip: perZip, note: note || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.issues?.[0]?.message ?? d.error ?? "Could not build the list");
    setOut(d);
    router.refresh();
  }

  const absolute = (path: string) => (typeof window === "undefined" ? path : new URL(withBase(path), window.location.origin).href);
  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label htmlFor="pl-biz">Prospect business</Label><Input id="pl-biz" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Test Roofing" /></div>
        <div>
          <Label htmlFor="pl-trade">Trade</Label>
          <Select id="pl-trade" value={trade} onChange={(e) => setTrade(e.target.value)}>{trades.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
        </div>
        <div><Label htmlFor="pl-zips" hint="Up to 3">ZIP codes</Label><Input id="pl-zips" value={zips} onChange={(e) => setZips(e.target.value)} placeholder="44107, 44111" /></div>
        <div><Label htmlFor="pl-per">Homes per ZIP</Label><Input id="pl-per" type="number" min={1} max={50} value={perZip} onChange={(e) => setPerZip(Math.min(50, Math.max(1, Number(e.target.value) || 25)))} /></div>
        <div className="md:col-span-2"><Label htmlFor="pl-note">Note (only you see it)</Label><Input id="pl-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <Button type="button" onClick={() => void make()} disabled={busy || business.trim().length < 2 || !zipList.length}>{busy ? "Building…" : "Build the list"}</Button>
      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}
      {out ? (
        <div role="status" className="space-y-2 rounded-[10px] bg-won-50 p-4 text-sm">
          <p className="font-semibold">{countOf(out.homes, "home")}. Share link (expires in 14 days):</p>
          <Input readOnly value={absolute(out.link)} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
          <a className="font-semibold text-navy underline" href={withBase(out.csv)}>Download CSV</a>
        </div>
      ) : null}
    </Card>
  );
}

/** Non-production: end a link now to check the expired page. */
export function ExpireButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button type="button" className="focus-ring text-lost underline" onClick={async () => {
      await fetch(withBase(`/api/admin/prospect-lists/${id}/expire`), { method: "POST" });
      router.refresh();
    }}>Expire (test)</button>
  );
}
