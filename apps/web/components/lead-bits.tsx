import clsx from "clsx";
import { agoPhrase } from "@216leads/shared";

export function ScoreChip({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tone = score >= 80 ? "bg-signal-600 text-white" : score >= 65 ? "bg-navy text-white" : "bg-navy-50 text-navy";
  return (
    <span
      aria-label={`Score ${score} out of 100`}
      className={clsx(
        "num inline-flex shrink-0 items-center justify-center rounded-[10px] font-bold",
        size === "lg" ? "h-14 w-14 text-2xl" : "h-10 w-10 text-base",
        tone,
      )}
    >
      {score}
    </span>
  );
}

/** "Sold 6 days ago" style pill from the lead's trigger. */
export function triggerText(label: string | null, date: string | null): string | null {
  if (!label) return null;
  if (!date) return label;
  const ago = agoPhrase(date);
  if (/sold/i.test(label)) return `Sold ${ago}`;
  if (/citation/i.test(label)) return `${label} · ${ago}`;
  return `${label} · ${ago}`;
}

export function TriggerPill({ label, date }: { label: string | null; date: string | null }) {
  const text = triggerText(label, date);
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-2.5 py-1 text-xs font-semibold text-signal-600">
      <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
      {text}
    </span>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost", skipped: "Skipped",
};

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    new: "bg-navy-50 text-navy",
    contacted: "bg-[#e8f0fb] text-[#1d4f91]",
    quoted: "bg-[#f3ecfb] text-[#5b2a91]",
    won: "bg-won-50 text-won",
    lost: "bg-lost-50 text-lost",
    skipped: "bg-line/60 text-slate",
  };
  return <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", tone[status] ?? tone.new)}>{STATUS_LABEL[status] ?? status}</span>;
}

export interface ReasonView {
  key: string;
  label: string;
  points?: number;
  evidence?: { url?: string; date?: string; contractor?: string | null };
}

export function ReasonList({ reasons, limit, links = false }: { reasons: ReasonView[]; limit?: number; links?: boolean }) {
  const list = limit ? reasons.slice(0, limit) : reasons;
  return (
    <ul className="space-y-1.5">
      {list.map((r) => (
        <li key={r.key} className="flex items-start gap-2 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
          <span className="min-w-0">
            {links && r.evidence?.url ? (
              <a href={r.evidence.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-signal">
                {r.label}
              </a>
            ) : (
              r.label
            )}
            {links && r.evidence?.contractor ? <span className="text-slate"> · {r.evidence.contractor}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
