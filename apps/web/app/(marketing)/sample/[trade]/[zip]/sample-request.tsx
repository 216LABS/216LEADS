"use client";
import { useState } from "react";
import Script from "next/script";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label } from "@/components/ui";

/** "Email me the full sample": saves a prospect_request (spec 8). */
export function SampleRequest({ trade, zip, siteKey }: { trade: string; zip: string; siteKey: string | null }) {
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (done) return <Card className="mt-8 p-5" role="status"><p className="font-semibold">{done}</p></Card>;
  return (
    <Card className="mt-8 p-5">
      {siteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <h2 className="font-semibold">Not ready to sign up? Get this sample by email.</h2>
      <form className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const token = (new FormData(e.currentTarget).get("cf-turnstile-response") as string | null) ?? undefined;
        const res = await fetch(withBase("/api/public/sample"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, business: business || undefined, trade, zips: [zip], token }),
        });
        const data = await res.json().catch(() => ({}));
        setBusy(false);
        if (res.ok) setDone(data.message);
        else setError(data.issues?.[0]?.message ?? data.error ?? "Something went wrong");
      }}>
        <div><Label htmlFor="s-email">Email</Label><Input id="s-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="s-biz">Business name</Label><Input id="s-biz" value={business} onChange={(e) => setBusiness(e.target.value)} /></div>
        <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Email me"}</Button>
        {siteKey ? <div className="cf-turnstile md:col-span-3" data-sitekey={siteKey} /> : null}
        {error ? <p role="alert" className="text-sm text-lost md:col-span-3">{error}</p> : null}
      </form>
    </Card>
  );
}
