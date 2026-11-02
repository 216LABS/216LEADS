"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label } from "@/components/ui";
import { PostcardPreview } from "@/components/postcard-preview";

interface BrandOrg { name: string; phone: string | null; website: string | null; default_offer: string | null; has_logo: boolean }

/** Onboarding step 4, also Settings → Brand (`inSettings`: save in place instead of moving on). */
export function BrandForm({ org, inSettings = false }: { org: BrandOrg; inSettings?: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState(org.phone ?? "");
  const [website, setWebsite] = useState(org.website ?? "");
  const [offer, setOffer] = useState(org.default_offer ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(org.has_logo ? withBase("/api/org/logo") : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function upload(file: File) {
    setError(null);
    const form = new FormData();
    form.set("logo", file);
    const res = await fetch(withBase("/api/org/logo"), { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Could not upload the logo");
    setLogoUrl(`${withBase("/api/org/logo")}?v=${Date.now()}`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(withBase("/api/org/brand"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone || null, website: website || null, default_offer: offer || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.issues?.[0]?.message ?? data.error ?? "Could not save");
    }
    if (!inSettings) return router.push("/onboarding/plan");
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="space-y-4 p-5">
        <div>
          <Label htmlFor="logo" hint="PNG, JPEG or WebP, up to 512 KB">Logo</Label>
          <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} placeholder="(216) 555-0100" />
        </div>
        <div>
          <Label htmlFor="website" hint="optional">Website</Label>
          <Input id="website" inputMode="url" autoComplete="url" value={website} maxLength={200} onChange={(e) => setWebsite(e.target.value)} placeholder="yoursite.com" />
        </div>
        <div>
          <Label htmlFor="offer">Default offer</Label>
          <Input id="offer" value={offer} maxLength={120} onChange={(e) => setOffer(e.target.value)} placeholder="$150 off a full roof replacement" />
        </div>
      </Card>
      <PostcardPreview business={org.name} headline="Your neighbors are getting work done." offer={offer} phone={phone} website={website} logoUrl={logoUrl} />
      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-won">Saved.</p> : null}
      <div className="flex gap-3">
        {inSettings ? null : <Button type="button" variant="secondary" onClick={() => router.push("/onboarding/plan")}>Skip for now</Button>}
        <Button type="submit" className="flex-1" disabled={busy}>{busy ? "Saving…" : inSettings ? "Save" : "Save and continue"}</Button>
      </div>
    </form>
  );
}
