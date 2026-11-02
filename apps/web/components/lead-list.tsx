"use client";
// Lead list (spec 9.2). Phones: cards with quick actions; swipe right = contacted, left = skip.
// Desktop: a dense table with multi-select, bulk status and "Export CSV".
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { titleCase, withBase } from "@216leads/shared";
import { ReasonList, ScoreChip, StatusPill, TriggerPill, type ReasonView } from "./lead-bits";
import { Button } from "./ui";

export interface ListLead {
  id: string;
  score: number;
  reasons: ReasonView[];
  trigger_label: string | null;
  trigger_date: string | null;
  status: string;
  addr_line: string;
  city: string;
  zip: string;
  year_built: number | null;
  market_value: number | null;
}

async function setStatus(ids: string[], status: string) {
  const res = ids.length === 1
    ? await fetch(withBase(`/api/leads/${ids[0]}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    : await fetch(withBase("/api/leads/bulk"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not update");
}

const SWIPE_PX = 80;

function LeadCard({ lead, onStatus }: { lead: ListLead; onStatus: (id: string, s: string) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <li className="relative overflow-hidden rounded-[12px]">
      <div aria-hidden className={clsx("absolute inset-0 flex items-center px-5 text-sm font-bold text-white",
        dx > 0 ? "justify-start bg-[#1d4f91]" : "justify-end bg-slate")}>{dx > 0 ? "Contacted" : dx < 0 ? "Skip" : ""}</div>
      <div
        className="card relative touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : "transform 150ms" }}
        onTouchStart={(e) => (start.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
        onTouchMove={(e) => {
          if (!start.current) return;
          const x = e.touches[0]!.clientX - start.current.x;
          const y = e.touches[0]!.clientY - start.current.y;
          if (Math.abs(x) > Math.abs(y)) setDx(Math.max(-120, Math.min(120, x)));
        }}
        onTouchEnd={() => {
          start.current = null;
          if (dx >= SWIPE_PX) onStatus(lead.id, "contacted");
          else if (dx <= -SWIPE_PX) onStatus(lead.id, "skipped");
          setDx(0);
        }}
      >
        <Link href={`/leads/${lead.id}`} data-lead-link className="focus-ring flex gap-3 p-4 pb-2">
          <ScoreChip score={lead.score} />
          <div className="min-w-0 flex-1">
            <div className="num truncate text-base font-semibold">{titleCase(lead.addr_line)}</div>
            <div className="text-sm text-slate">{titleCase(lead.city)} {lead.zip}</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <TriggerPill label={lead.trigger_label} date={lead.trigger_date} />
              <StatusPill status={lead.status} />
            </div>
            <div className="mt-2 text-slate"><ReasonList reasons={lead.reasons} limit={2} /></div>
          </div>
        </Link>
        <div className="flex gap-2 border-t border-line px-4 py-2">
          <button type="button" className="focus-ring tap flex-1 rounded-[10px] text-sm font-semibold text-navy hover:bg-navy-50"
            onClick={() => onStatus(lead.id, "contacted")} disabled={lead.status === "contacted"}>Contacted</button>
          <Link href={`/mail/send?leads=${lead.id}`} className="focus-ring tap flex flex-1 items-center justify-center rounded-[10px] text-sm font-semibold text-signal-600 hover:bg-navy-50">Mail</Link>
          <button type="button" className="focus-ring tap flex-1 rounded-[10px] text-sm font-semibold text-slate hover:bg-navy-50"
            onClick={() => onStatus(lead.id, "skipped")} disabled={lead.status === "skipped"}>Skip</button>
        </div>
      </div>
    </li>
  );
}

export function LeadList({ leads }: { leads: ListLead[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState(leads);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [lastLeads, setLastLeads] = useState(leads);
  if (leads !== lastLeads) {
    // New server data (filters changed): reset local state.
    setLastLeads(leads);
    setRows(leads);
    setSelected(new Set());
  }

  async function change(ids: string[], status: string) {
    setError(null);
    const before = rows;
    setRows((r) => r.map((l) => (ids.includes(l.id) ? { ...l, status } : l)));
    try {
      await setStatus(ids, status);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setRows(before);
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  const all = rows.length > 0 && rows.every((l) => selected.has(l.id));
  const exportHref = (ids?: string[]) => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page");
    if (ids?.length) p.set("ids", ids.join(","));
    return withBase(`/api/leads/export.csv?${p.toString()}`);
  };

  return (
    <>
      {error ? <p role="alert" className="mb-3 text-sm text-lost">{error}</p> : null}
      <ul className="space-y-3 md:hidden" aria-label="Leads">
        {rows.map((l) => <LeadCard key={l.id} lead={l} onStatus={(id, s) => void change([id], s)} />)}
      </ul>

      <div className="hidden md:block">
        <div className="mb-2 flex min-h-[44px] flex-wrap items-center gap-2">
          {selected.size ? (
            <>
              <span className="text-sm font-semibold">{selected.size} selected</span>
              <Button variant="secondary" onClick={() => void change([...selected], "contacted")}>Mark contacted</Button>
              <Button variant="secondary" onClick={() => void change([...selected], "skipped")}>Skip</Button>
              <Link className="focus-ring tap inline-flex items-center rounded-[10px] bg-signal-600 px-4 text-sm font-semibold text-white"
                href={`/mail/send?leads=${[...selected].join(",")}`}>Mail selected</Link>
              <a className="focus-ring tap inline-flex items-center rounded-[10px] border border-line bg-white px-4 text-sm font-semibold text-navy hover:border-navy"
                href={exportHref([...selected])}>Export selected</a>
            </>
          ) : (
            <a className="focus-ring tap ml-auto inline-flex items-center rounded-[10px] border border-line bg-white px-4 text-sm font-semibold text-navy hover:border-navy"
              href={exportHref()}>Export CSV</a>
          )}
        </div>
        <table className="card w-full overflow-hidden text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="w-10 p-3">
                <input type="checkbox" aria-label="Select all on this page" checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(rows.map((l) => l.id)))} />
              </th>
              <th className="p-3">Score</th>
              <th className="p-3">Address</th>
              <th className="p-3">Why</th>
              <th className="p-3">Trigger</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((l) => (
              <tr key={l.id} className={clsx("hover:bg-paper", selected.has(l.id) && "bg-navy-50/60")}>
                <td className="p-3">
                  <input type="checkbox" aria-label={`Select ${titleCase(l.addr_line)}`} checked={selected.has(l.id)}
                    onChange={() => setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    })} />
                </td>
                <td className="p-3"><ScoreChip score={l.score} /></td>
                <td className="p-3">
                  <Link href={`/leads/${l.id}`} data-lead-link className="focus-ring num font-semibold hover:underline">{titleCase(l.addr_line)}</Link>
                  <div className="text-xs text-slate">{titleCase(l.city)} {l.zip}</div>
                </td>
                <td className="max-w-sm p-3 text-slate"><ReasonList reasons={l.reasons} limit={2} /></td>
                <td className="p-3"><TriggerPill label={l.trigger_label} date={l.trigger_date} /></td>
                <td className="p-3"><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
