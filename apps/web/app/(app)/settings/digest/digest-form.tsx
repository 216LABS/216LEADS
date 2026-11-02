"use client";
import { useState } from "react";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label, Select, Textarea, Toggle } from "@/components/ui";

interface Address { name: string; line1: string; line2: string; city: string; state: string; zip: string }
interface DigestSettings { digest_enabled: boolean; digest_day: number; digest_emails: string[]; return_address: Address | null }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const blankAddress: Address = { name: "", line1: "", line2: "", city: "", state: "OH", zip: "" };

export function DigestForm({ initial, canEdit }: { initial: DigestSettings; canEdit: boolean }) {
  const [enabled, setEnabled] = useState(initial.digest_enabled);
  const [day, setDay] = useState(initial.digest_day);
  const [emails, setEmails] = useState(initial.digest_emails.join("\n"));
  const [addr, setAddr] = useState<Address>(initial.return_address ?? blankAddress);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => setAddr((a) => ({ ...a, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const hasAddr = addr.line1.trim() !== "";
    const res = await fetch(withBase("/api/settings/org"), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        digest_enabled: enabled, digest_day: day,
        digest_emails: emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
        return_address: hasAddr ? addr : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: data.issues?.[0]?.message ?? data.error ?? "Could not save" });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Card className="space-y-4 p-5">
          <h2 className="font-bold">Weekly digest</h2>
          <Toggle label="Send the weekly digest" description="New leads, triggers and what changed, once a week." checked={enabled} onChange={setEnabled} />
          <div>
            <Label htmlFor="day">Day</Label>
            <Select id="day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="emails" hint="one per line, up to 10">Send to</Label>
            <Textarea id="emails" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
          </div>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="font-bold">Return address for postcards</h2>
          <p className="text-sm text-slate">Printed on every postcard; undeliverable mail comes back here.</p>
          <div><Label htmlFor="ra-name">Business name</Label><Input id="ra-name" value={addr.name} onChange={set("name")} maxLength={80} /></div>
          <div><Label htmlFor="ra-1">Street address</Label><Input id="ra-1" value={addr.line1} onChange={set("line1")} maxLength={80} autoComplete="address-line1" /></div>
          <div><Label htmlFor="ra-2" hint="optional">Suite or unit</Label><Input id="ra-2" value={addr.line2} onChange={set("line2")} maxLength={80} autoComplete="address-line2" /></div>
          <div className="grid grid-cols-[2fr_1fr_1.3fr] gap-2">
            <div><Label htmlFor="ra-city">City</Label><Input id="ra-city" value={addr.city} onChange={set("city")} maxLength={40} /></div>
            <div><Label htmlFor="ra-state">State</Label><Input id="ra-state" value={addr.state} onChange={set("state")} maxLength={2} /></div>
            <div><Label htmlFor="ra-zip">ZIP</Label><Input id="ra-zip" inputMode="numeric" value={addr.zip} onChange={set("zip")} maxLength={5} /></div>
          </div>
        </Card>
      </fieldset>
      {!canEdit ? <p className="text-sm text-slate">Only the account owner can change these.</p> : null}
      {msg ? <p className={msg.ok ? "text-sm text-won" : "text-sm text-lost"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null}
      <Button type="submit" disabled={!canEdit || busy}>{busy ? "Saving…" : "Save"}</Button>
    </form>
  );
}
