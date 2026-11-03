"use client";
// Lead detail actions (spec 9.4): status selector with the won (job amount) and lost (reason)
// flows, the notes box, and copy-the-pitch.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { STATUS_LABEL } from "@/components/lead-bits";
import { Button, Input, Select, Textarea } from "@/components/ui";

const LOST = [
  { value: "price", label: "Price" }, { value: "timing", label: "Timing" }, { value: "competitor", label: "Went with a competitor" },
  { value: "no_response", label: "No response" }, { value: "other", label: "Other" },
];

async function patch(id: string, payload: Record<string, unknown>) {
  const res = await fetch(withBase(`/api/leads/${id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
}

export function LeadStatus({ id, status, wonAmount, lostReason }: { id: string; status: string; wonAmount: number | null; lostReason: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<"won" | "lost" | null>(null);
  const [amount, setAmount] = useState(wonAmount ? String(wonAmount) : "");
  const [reason, setReason] = useState(lostReason ?? "price");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await patch(id, payload);
      setPending(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <label className="block">
        <span className="sr-only mb-1 text-xs text-slate md:not-sr-only md:block">Status</span>
        <Select value={pending ?? status} disabled={busy} aria-label="Status"
          onChange={(e) => {
            const v = e.target.value;
            if (v === "won" || v === "lost") setPending(v);
            else void save({ status: v });
          }}>
          {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
      </label>
      {pending === "won" ? (
        <form className="mt-2 flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const n = Math.round(Number(amount.replace(/[^\d.]/g, "")));
          void save({ status: "won", won_amount: Number.isFinite(n) && amount.trim() ? n : null });
        }}>
          <Input aria-label="Job amount in dollars" inputMode="numeric" placeholder="Job amount ($)" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <Button type="submit" variant="navy" disabled={busy}>Save</Button>
        </form>
      ) : null}
      {pending === "lost" ? (
        <form className="mt-2 flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          void save({ status: "lost", lost_reason: reason });
        }}>
          <Select aria-label="Why was it lost?" value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOST.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
          <Button type="submit" variant="navy" disabled={busy}>Save</Button>
        </form>
      ) : null}
      {pending ? <button type="button" className="mt-1 text-xs text-slate underline" onClick={() => setPending(null)}>Cancel</button> : null}
      {error ? <p role="alert" className="mt-1 text-sm text-lost">{error}</p> : null}
    </div>
  );
}

export function NoteBox({ id }: { id: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      setBusy(true);
      setError(null);
      const res = await fetch(withBase(`/api/leads/${id}/notes`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      setBusy(false);
      if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not save the note");
      setText("");
      router.refresh();
    }}>
      <label htmlFor="note" className="sr-only">Add a note</label>
      <Textarea id="note" rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note: called, left a door hanger, quoted $9,800…" />
      <div className="mt-2 flex items-center justify-between">
        {error ? <p role="alert" className="text-sm text-lost">{error}</p> : <span />}
        <Button type="submit" variant="navy" disabled={busy || !text.trim()}>{busy ? "Saving…" : "Add note"}</Button>
      </div>
    </form>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="focus-ring rounded-[8px] border border-line px-3 py-1 text-sm font-semibold text-navy hover:border-navy"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
