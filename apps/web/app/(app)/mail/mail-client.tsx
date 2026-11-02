"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label, Select, Toggle } from "@/components/ui";

export interface TplView { id: string; name: string; system: boolean; merge: Record<string, string | null | undefined> & { design?: string } }

async function post<T>(path: string, payload: unknown, method = "POST"): Promise<T> {
  const res = await fetch(withBase(path), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Something went wrong");
  return data as T;
}

export function CancelBatch({ batchId, until }: { batchId: string; until: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const mins = Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 60_000));
  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
      setBusy(true);
      await post("/api/mail/pieces", { batch_id: batchId }).catch(() => undefined);
      router.refresh();
    }}>
      {busy ? "Canceling…" : `Cancel (${mins} min left)`}
    </Button>
  );
}

/** Live front/back preview of a template with the org's details (spec 9.5). */
export function PostcardFrames({ merge }: { merge: Record<string, unknown> }) {
  const [html, setHtml] = useState<{ front: string; back: string } | null>(null);
  const key = JSON.stringify(merge);
  useEffect(() => {
    const t = setTimeout(() => {
      post<{ front: string; back: string }>("/api/mail/preview", { merge }).then(setHtml).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Postcard preview">
      {(["front", "back"] as const).map((side) => (
        <div key={side} className="overflow-hidden rounded-[10px] border border-line bg-white" style={{ aspectRatio: "6.25 / 4.25" }}>
          {html ? <iframe title={`Postcard ${side}`} srcDoc={html[side]} className="pointer-events-none origin-top-left" style={{ width: 600, height: 408, transform: "scale(var(--s))", border: 0 }}
            ref={(el) => { if (el?.parentElement) el.style.setProperty("--s", String(el.parentElement.clientWidth / 600)); }} /> : null}
        </div>
      ))}
    </div>
  );
}

export function Builder({ templates, defaults }: { templates: TplView[]; defaults: { phone: string | null; website: string | null; offer: string | null } }) {
  const router = useRouter();
  const [tid, setTid] = useState(templates[0]?.id ?? "");
  const base = templates.find((t) => t.id === tid)?.merge ?? {};
  const [f, setF] = useState({ headline: "", offer: "", expiry: "", phone: "", website: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  useEffect(() => {
    setF({ headline: base.headline ?? "", offer: base.offer ?? defaults.offer ?? "", expiry: base.expiry ?? "", phone: base.phone ?? defaults.phone ?? "", website: base.website ?? defaults.website ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);
  const merge = { design: base.design ?? "neighbors", headline: f.headline || undefined, offer: f.offer || undefined, expiry: f.expiry || null, phone: f.phone || undefined, website: f.website || null };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section>
      <h2 className="mb-2 font-bold">Postcards</h2>
      <Card className="space-y-4 p-5">
        <div>
          <Label htmlFor="tpl">Template</Label>
          <Select id="tpl" value={tid} onChange={(e) => setTid(e.target.value)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.system ? "" : " (yours)"}</option>)}
          </Select>
        </div>
        <div><Label htmlFor="headline" hint="{street} and {year_built} fill in per home">Headline</Label><Input id="headline" maxLength={120} value={f.headline} onChange={set("headline")} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="offer">Offer</Label><Input id="offer" maxLength={120} value={f.offer} onChange={set("offer")} /></div>
          <div><Label htmlFor="expiry" hint="optional">Offer ends</Label><Input id="expiry" maxLength={40} value={f.expiry} onChange={set("expiry")} placeholder="Dec 31" /></div>
          <div><Label htmlFor="mphone">Phone</Label><Input id="mphone" maxLength={30} value={f.phone} onChange={set("phone")} /></div>
          <div><Label htmlFor="msite" hint="QR code links here">Website</Label><Input id="msite" maxLength={200} value={f.website} onChange={set("website")} /></div>
        </div>
        <PostcardFrames merge={merge} />
        <p className="text-xs text-slate">Addressed to &ldquo;Current Resident&rdquo;. The footer always says how to stop mail.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={async () => {
            setMsg(null);
            try {
              const r = await post<{ pdfUrl: string | null }>("/api/mail/preview", { merge, proof: true });
              setMsg(r.pdfUrl ? { ok: true, text: "Proof ready.", url: r.pdfUrl } : { ok: true, text: "PDF proofs come from the print provider (Lob test key). The preview above is what prints." });
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not make a proof" });
            }
          }}>Get proof PDF</Button>
          <Button type="button" variant="navy" onClick={async () => {
            const name = window.prompt("Name this template", `${templates.find((t) => t.id === tid)?.name ?? "My"} (custom)`);
            if (!name) return;
            try {
              await post("/api/mail/templates", { name, merge });
              setMsg({ ok: true, text: "Template saved." });
              router.refresh();
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
            }
          }}>Save as my template</Button>
        </div>
        {msg ? <p role="status" className={msg.ok ? "text-sm text-won" : "text-sm text-lost"}>{msg.text} {msg.url ? <a className="underline" href={msg.url} target="_blank" rel="noreferrer">Open PDF</a> : null}</p> : null}
      </Card>
    </section>
  );
}

interface RuleView { enabled: boolean; template_id: string; min_score: number; trigger_kinds: string[]; max_per_week: number; monthly_cap_cents: number; followup_days: number[] }

export function AutoMailCard({ templates, rule, canEdit }: { templates: TplView[]; rule: RuleView | null; canEdit: boolean }) {
  const [r, setR] = useState<RuleView>(rule ?? { enabled: false, template_id: templates[0]?.id ?? "", min_score: 70, trigger_kinds: ["sale"], max_per_week: 25, monthly_cap_cents: 10000, followup_days: [] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section>
      <h2 className="mb-2 font-bold">Auto-mail</h2>
      <Card className="space-y-4 p-5">
        <fieldset disabled={!canEdit} className="space-y-4">
          <Toggle label={`Mail every new home scoring ${r.min_score}+ that just sold`} description="Runs every morning after the new data lands. Never mails a home twice in 30 days."
            checked={r.enabled} onChange={(enabled) => setR({ ...r, enabled })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="ams">Minimum score</Label><Input id="ams" type="number" min={40} max={100} value={r.min_score} onChange={(e) => setR({ ...r, min_score: Number(e.target.value) })} /></div>
            <div><Label htmlFor="amw">Most per week</Label><Input id="amw" type="number" min={1} max={500} value={r.max_per_week} onChange={(e) => setR({ ...r, max_per_week: Number(e.target.value) })} /></div>
            <div><Label htmlFor="amc">Monthly cap ($)</Label><Input id="amc" type="number" min={0} value={r.monthly_cap_cents / 100} onChange={(e) => setR({ ...r, monthly_cap_cents: Math.round(Number(e.target.value) * 100) })} /></div>
          </div>
          <div>
            <Label htmlFor="amt">Template</Label>
            <Select id="amt" value={r.template_id} onChange={(e) => setR({ ...r, template_id: e.target.value })}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <Toggle label="Follow up on day 21" description="A second card to homes still open three weeks later." checked={r.followup_days.includes(21)}
            onChange={(on) => setR({ ...r, followup_days: on ? [21] : [] })} />
        </fieldset>
        {msg ? <p role="status" className={msg.ok ? "text-sm text-won" : "text-sm text-lost"}>{msg.text}</p> : null}
        {canEdit ? (
          <Button type="button" onClick={async () => {
            try {
              await post("/api/mail/rules", r, "PUT");
              setMsg({ ok: true, text: "Saved." });
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
            }
          }}>Save auto-mail</Button>
        ) : <p className="text-sm text-slate">Only the account owner can change auto-mail.</p>}
      </Card>
    </section>
  );
}
