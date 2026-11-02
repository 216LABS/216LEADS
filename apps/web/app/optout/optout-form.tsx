"use client";
import { useState } from "react";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label } from "@/components/ui";

export function OptoutForm({ siteKey }: { siteKey: string | null }) {
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) return <Card className="mt-6 p-5" role="status"><p className="font-semibold">{done}</p></Card>;

  return (
    <form className="mt-6 space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      const token = (new FormData(e.currentTarget).get("cf-turnstile-response") as string | null) ?? undefined;
      const res = await fetch(withBase("/api/public/optout"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ street, zip, token }) });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (res.ok) setDone(data.message);
      else setError(data.issues?.[0]?.message ?? data.error ?? "Something went wrong");
    }}>
      <div>
        <Label htmlFor="street">Street address</Label>
        <Input id="street" autoComplete="address-line1" required value={street} onChange={(e) => setStreet(e.target.value)} placeholder="1234 W 117th St" />
      </div>
      <div>
        <Label htmlFor="zip">ZIP code</Label>
        <Input id="zip" inputMode="numeric" autoComplete="postal-code" required value={zip} onChange={(e) => setZip(e.target.value)} placeholder="44107" />
      </div>
      {siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} /> : null}
      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Stop mail"}</Button>
    </form>
  );
}
