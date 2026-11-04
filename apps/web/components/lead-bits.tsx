import clsx from "clsx";
import { agoPhrase } from "@216leads/shared";

/**
 * The score as a figure with a thin bar showing how far it is to 100. Orange is kept for 80+, so in
 * a list of fifty the hot ones still stand out (a solid orange tile on every row made none of them).
 */
export function ScoreChip({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tier = score >= 80 ? "hot" : score >= 65 ? "good" : "fair";
  // The figure stays navy; the bar carries the tier, so a page of 80+ homes is not a page of orange.
  const text = tier === "fair" ? "text-slate" : "text-navy";
  const bar = { hot: "bg-signal", good: "bg-navy", fair: "bg-slate/50" }[tier];
  return (
    <span aria-label={`Score ${score} out of 100`} className={clsx("inline-flex shrink-0 flex-col items-start", size === "lg" ? "w-16 gap-1.5" : "w-10 gap-1")}>
      <span className={clsx("num font-semibold leading-none", size === "lg" ? "text-[34px]" : "text-[17px]", text)}>{score}</span>
      <span aria-hidden className="block h-[3px] w-full bg-line">
        <span className={clsx("block h-full", bar)} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </span>
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
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-signal-600">
      <span className="h-1.5 w-1.5 bg-signal" aria-hidden />
      {text}
    </span>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost", skipped: "Skipped",
};

export function StatusPill({ status }: { status: string }) {
  // A dot and the word, not a filled pill per row.
  const tone: Record<string, [string, string]> = {
    new: ["bg-slate/40", "text-slate"],
    contacted: ["bg-contacted", "text-contacted"],
    quoted: ["bg-quoted", "text-quoted"],
    won: ["bg-won", "text-won"],
    lost: ["bg-lost", "text-lost"],
    skipped: ["bg-line", "text-slate"],
  };
  const [dot, text] = tone[status] ?? tone.new!;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold", text)}>
      <span aria-hidden className={clsx("h-2 w-2 rounded-full", dot)} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export interface ReasonView {
  key: string;
  label: string;
  points?: number;
  evidence?: { url?: string; date?: string; contractor?: string | null };
}

/** "(no Lakewood permit records online)" at the end of an age reason, and the town it names. */
const NO_PERMITS = /\s*\(no (.+?) permit records online\)$/i;

/** A reason without the no-permits note, for lists and cards. */
export const shortReason = (label: string) => label.replace(NO_PERMITS, "");

/** Towns whose rows had the no-permits note removed, for one line under a list instead. */
export function townsWithoutPermits(reasons: ReasonView[][]): string[] {
  return [...new Set(reasons.flatMap((rs) => rs.map((r) => NO_PERMITS.exec(r.label)?.[1]).filter((t): t is string => !!t)))];
}

export function ReasonList({ reasons, limit, links = false, compact = false }: { reasons: ReasonView[]; limit?: number; links?: boolean; compact?: boolean }) {
  // In lists the no-permits note repeated on half the rows; it is said once under the list instead.
  const list = (limit ? reasons.slice(0, limit) : reasons).map((r) => (compact ? { ...r, label: shortReason(r.label) } : r));
  return (
    <ul className="space-y-1.5">
      {list.map((r) => (
        <li key={r.key} className="flex items-start gap-2 text-sm">
          <span className="mt-[9px] h-px w-2.5 shrink-0 bg-slate/60" aria-hidden />
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
