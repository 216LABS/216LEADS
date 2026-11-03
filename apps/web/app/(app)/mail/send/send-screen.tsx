"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { countOf, withBase } from "@216leads/shared";
import { Button, Card, Label, Select } from "@/components/ui";
import { MAP_SELECTION_KEY } from "@/lib/map-selection";
import { PostcardFrames, type TplView } from "../mail-client";

interface Preview {
  requested: number; sending: number; removed: Record<string, number>; credits: number; metered: number; cost_cents: number; delivery: string;
  queued?: number; failed?: number; batch_id?: string; cancel_until?: string;
}

const REMOVED_LABEL: Record<string, string> = {
  territory: "outside your area", suppression: "asked not to get mail", your_list: "on your customer or hidden list",
  mailed_recently: "mailed in the last 30 days", no_funds: "no credits left and no card on file", bad_address: "incomplete address",
};

export function SendScreen({ leadIds: initialLeadIds, parcelKeys, templates, fromMap }: { leadIds: string[]; parcelKeys: string[]; templates: TplView[]; fromMap?: boolean }) {
  const [leadIds, setLeadIds] = useState(initialLeadIds);
  const [ready, setReady] = useState(!fromMap);
  const [tid, setTid] = useState(templates[0]?.id ?? "");
  const [p, setP] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tpl = templates.find((t) => t.id === tid);
  const payload = { lead_ids: leadIds, parcel_keys: parcelKeys, template_id: tid };

  async function call(confirm: boolean) {
    setError(null);
    const res = await fetch(withBase("/api/mail/send"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, confirm }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Something went wrong");
    return data as Preview;
  }

  useEffect(() => {
    if (!fromMap) return;
    try {
      const ids = JSON.parse(sessionStorage.getItem(MAP_SELECTION_KEY) ?? "[]");
      if (Array.isArray(ids)) setLeadIds(ids.filter((x): x is string => typeof x === "string").slice(0, 500));
    } catch {
      // storage blocked or empty: the screen falls back to "pick homes first"
    }
    setReady(true);
  }, [fromMap]);

  useEffect(() => {
    if (!tid || (!leadIds.length && !parcelKeys.length)) return;
    call(false).then(setP).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, leadIds]);

  if (!ready) return null;
  if (!leadIds.length && !parcelKeys.length) return <p className="text-slate">Pick homes on <Link className="underline" href="/leads">Leads</Link> first.</p>;
  if (p?.batch_id) {
    return (
      <Card className="p-5" role="status">
        <h2 className="text-lg font-semibold">{p.queued} postcard{p.queued === 1 ? "" : "s"} queued</h2>
        <p className="mt-1 text-sm text-slate">You can cancel until {new Date(p.cancel_until!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} on the <Link className="underline" href="/mail">Mail</Link> tab.{p.failed ? ` ${p.failed} failed and were not charged.` : ""}</p>
      </Card>
    );
  }
  const removed = p ? Object.entries(p.removed).filter(([, n]) => n > 0) : [];
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div>
          <Label htmlFor="stpl">Postcard</Label>
          <Select id="stpl" value={tid} onChange={(e) => setTid(e.target.value)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.system ? "" : " (yours)"}</option>)}
          </Select>
        </div>
        {tpl ? <PostcardFrames merge={{ design: tpl.merge.design ?? "neighbors", headline: tpl.merge.headline ?? undefined }} /> : null}
      </Card>
      <Card className="space-y-2 p-5" aria-live="polite">
        {p ? (
          <>
            <p className="text-lg"><span className="num font-semibold">{p.sending}</span> of {countOf(p.requested, "home")} {p.sending === 1 ? "gets" : "will get"} a postcard</p>
            {removed.length ? <ul className="text-sm text-slate">{removed.map(([k, n]) => <li key={k}>{n} removed: {REMOVED_LABEL[k] ?? k}</li>)}</ul> : null}
            <p className="text-sm">Cost: <span className="font-semibold">{p.credits} credit{p.credits === 1 ? "" : "s"}{p.cost_cents ? ` + $${(p.cost_cents / 100).toFixed(2)}` : ""}</span></p>
            <p className="text-sm text-slate">Arrives {p.delivery}. You have 15 minutes to cancel after sending.</p>
          </>
        ) : error ? (
          // The check failed (rate limit, network): say so here instead of "Checking" forever.
          <p className="text-sm">
            Couldn&apos;t check these homes.{" "}
            <button type="button" className="focus-ring text-navy underline underline-offset-2" onClick={() => call(false).then(setP).catch((e) => setError(e.message))}>Try again</button>
          </p>
        ) : <p className="text-sm text-slate">Checking these homes…</p>}
      </Card>
      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}
      <Button type="button" className="w-full" disabled={!p?.sending || busy} onClick={async () => {
        setBusy(true);
        try {
          setP(await call(true));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not send");
        } finally {
          setBusy(false);
        }
      }}>
        {busy ? "Sending…" : p ? `Send ${p.sending} postcard${p.sending === 1 ? "" : "s"}` : "Send"}
      </Button>
    </div>
  );
}
