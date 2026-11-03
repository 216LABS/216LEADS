"use client";
// Lead list (spec 9.2, issue #59). Phones: cards with a full-width Mail button and Contacted / Skip
// buttons; swipe right = contacted, left = skip, as a shortcut for the same buttons.
// Desktop: a table with visible per-row actions, multi-select, bulk status and "Export CSV".
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { titleCase, withBase } from "@216leads/shared";
import { ReasonList, ScoreChip, StatusPill, TriggerPill, type ReasonView } from "./lead-bits";
import { Button, buttonClass } from "./ui";

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
const money = (n: number | null) => (n ? `$${Math.round(n / 1000).toLocaleString("en-US")}K` : "");

function LeadCard({ lead, onStatus }: { lead: ListLead; onStatus: (id: string, s: string) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <li className="relative overflow-hidden rounded-[10px]">
      <div aria-hidden className={clsx("absolute inset-0 flex items-center px-6 text-sm font-semibold text-white",
        dx > 0 ? "justify-start bg-contacted" : "justify-end bg-slate")}>{dx > 0 ? "Contacted" : dx < 0 ? "Skip" : ""}</div>
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
        <Link href={`/leads/${lead.id}`} data-lead-link className="focus-ring flex gap-4 p-4">
          <ScoreChip score={lead.score} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{titleCase(lead.addr_line)}</div>
            <div className="text-sm text-slate">{titleCase(lead.city)} {lead.zip}</div>
            <div className="mt-2 text-slate"><ReasonList reasons={lead.reasons} limit={1} /></div>
            {lead.trigger_label || lead.status !== "new" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <TriggerPill label={lead.trigger_label} date={lead.trigger_date} />
                {lead.status !== "new" ? <StatusPill status={lead.status} /> : null}
              </div>
            ) : null}
          </div>
        </Link>
        <div className="space-y-2 px-4 pb-4">
          <Link href={`/mail/send?leads=${lead.id}`} className={buttonClass("navy", "min-h-12 w-full")}>Mail</Link>
          <div className="flex gap-2">
            <Button variant="secondary" className="min-h-12 flex-1" onClick={() => onStatus(lead.id, "contacted")} disabled={lead.status === "contacted"}>Contacted</Button>
            <Button variant="secondary" className="min-h-12 flex-1" onClick={() => onStatus(lead.id, "skipped")} disabled={lead.status === "skipped"}>Skip</Button>
          </div>
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
      {error ? <p role="alert" className="mb-4 text-sm text-lost">{error}</p> : null}
      <ul className="space-y-4 md:hidden" aria-label="Leads">
        {rows.map((l) => <LeadCard key={l.id} lead={l} onStatus={(id, s) => void change([id], s)} />)}
      </ul>

      <div className="hidden md:block">
        <div className="mb-2 flex min-h-12 flex-wrap items-center gap-2" aria-live="polite">
          {selected.size ? (
            <>
              <span className="text-sm">{selected.size} selected</span>
              <button type="button" className="focus-ring text-sm text-slate underline" onClick={() => setSelected(new Set())}>Clear</button>
              <span className="mx-2 h-6 w-px bg-line" aria-hidden />
              <Link className={buttonClass("secondary")} href={`/mail/send?leads=${[...selected].join(",")}`}>Mail selected</Link>
              <Button variant="secondary" onClick={() => void change([...selected], "contacted")}>Mark contacted</Button>
              <Button variant="ghost" onClick={() => void change([...selected], "skipped")}>Skip</Button>
              <a className={buttonClass("ghost")} href={exportHref([...selected])}>Export selected</a>
            </>
          ) : (
            <a className={buttonClass("ghost", "ml-auto")} href={exportHref()}>Export CSV</a>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="w-10 py-2 pl-2 font-normal">
                <input type="checkbox" aria-label="Select all on this page" checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(rows.map((l) => l.id)))} />
              </th>
              <th className="px-2 py-2 font-normal">Score</th>
              <th className="px-2 py-2 font-normal">Address</th>
              <th className="px-2 py-2 font-normal">Why</th>
              <th className="px-2 py-2 text-right font-normal">Built</th>
              <th className="px-2 py-2 text-right font-normal">Value</th>
              <th className="px-2 py-2 font-normal">Status</th>
              <th className="px-2 py-2 text-right font-normal"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((l) => (
              <tr key={l.id} className={clsx("h-14 hover:bg-white", selected.has(l.id) && "bg-navy-50")}>
                <td className="py-2 pl-2">
                  <input type="checkbox" aria-label={`Select ${titleCase(l.addr_line)}`} checked={selected.has(l.id)}
                    onChange={() => setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    })} />
                </td>
                <td className="px-2 py-2"><ScoreChip score={l.score} /></td>
                <td className="px-2 py-2">
                  <Link href={`/leads/${l.id}`} data-lead-link className="focus-ring font-semibold hover:underline">{titleCase(l.addr_line)}</Link>
                  <div className="text-xs text-slate">{titleCase(l.city)} {l.zip}</div>
                </td>
                <td className="max-w-sm px-2 py-2 text-slate">
                  <ReasonList reasons={l.reasons} limit={1} />
                  {l.trigger_label ? <div className="mt-1"><TriggerPill label={l.trigger_label} date={l.trigger_date} /></div> : null}
                </td>
                <td className="num px-2 py-2 text-right">{l.year_built ?? ""}</td>
                <td className="num px-2 py-2 text-right">{money(l.market_value)}</td>
                <td className="px-2 py-2"><StatusPill status={l.status} /></td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <Link href={`/mail/send?leads=${l.id}`} className={buttonClass("secondary", "min-h-10")}>Mail</Link>
                  <button type="button" aria-label={`Mark ${titleCase(l.addr_line)} contacted`} title="Mark contacted"
                    className={buttonClass("ghost", "ml-1 min-h-10 px-2")} disabled={l.status === "contacted"} onClick={() => void change([l.id], "contacted")}>
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
