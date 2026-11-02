import Link from "next/link";
import { getDirectSql, getSql } from "@216leads/db";
import { categoryMatchCounts, ensurePresetVersion, learnedFor, listRecipeVersions, loadOrgProfile } from "@216leads/ingest";
import { MIN_OUTCOMES, nudgeSentence, signalLabel, triggerSentence } from "@216leads/scoring";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/session";
import { UseVersionButton } from "./use-version";
import { ResetLearnedButton } from "./reset-learned";

export const metadata = { title: "Scoring recipe" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  preset: "Starting preset", wizard: "Built from your answers", tweak: "Tweaked", slider: "Slider change", feedback: "Learned from your wins",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function RecipePage() {
  const { org } = await requireOrg();
  await ensurePresetVersion(getDirectSql(), org.id, org.trade);
  const sql = getSql();
  const [{ template, profile }, versions, counts, learned] = await Promise.all([
    loadOrgProfile(sql, org.id),
    listRecipeVersions(sql, org.id),
    categoryMatchCounts(sql),
    learnedFor(sql, org.id),
  ]);
  const [counted] = await sql<{ outcomes: number }[]>`
    select count(*)::int as outcomes from lead where org_id = ${org.id} and status in ('won', 'lost', 'skipped')
      and (${learned.learned_since}::timestamptz is null or status_changed_at >= ${learned.learned_since}::timestamptz)`;
  const outcomes = counted?.outcomes ?? 0;
  // The nightly job saves nudges as a "Learned from your wins" version; the factors behind it are kept here.
  const nudges = Object.entries(learned.learned_meta).filter(([, m]) => m.factor !== 1).map(([k, m]) => [k, m.factor] as const)
    .sort((a, b) => Math.abs(b[1] - 1) - Math.abs(a[1] - 1));
  const weights = Object.entries(template.signals).sort((a, b) => b[1].weight - a[1].weight);
  const total = weights.reduce((s, [, v]) => s + v.weight, 0) || 1;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/settings" className="text-slate underline underline-offset-2">Settings</Link></p>
      <PageHeader title="Scoring recipe" sub={`${template.label} · a home becomes a lead at ${template.threshold}+ or when something just happened.`} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">What we look for</h2>
          <ul className="space-y-2.5">
            {weights.map(([key, v]) => {
              const m = profile.weights[key] ?? 1;
              return (
                <li key={key}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span>{signalLabel(key)}</span>
                    <span className="num text-slate">{Math.round((100 * v.weight) / total)}%{m !== 1 ? ` × ${m}` : ""}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-navy-50">
                    <div className="h-1.5 rounded-full bg-navy" style={{ width: `${Math.round((100 * v.weight) / total)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">What moves a home up right away</h2>
          <ul className="space-y-2 text-sm">
            {template.triggers.map((t, i) => {
              const c = t.kind === "permit" && t.category ? counts[t.category] : undefined;
              const low = t.kind === "permit" && (!c || c.low_confidence);
              return (
                <li key={i} className="flex items-start justify-between gap-3">
                  <span>{triggerSentence(t)}</span>
                  <span className="flex shrink-0 gap-1">
                    <Badge tone="signal">+{t.boost}</Badge>
                    {low ? <Badge tone="slate">low confidence</Badge> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-slate">
            &ldquo;Low confidence&rdquo; means fewer than 20 real permits of that kind are on file in our area, so this trigger rarely fires.
          </p>
        </Card>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">Learned from your results</h2>
      <Card className="p-5">
        {nudges.length ? (
          <>
            <ul className="space-y-2 text-sm">
              {nudges.map(([key, f]) => (
                <li key={key} className="flex justify-between gap-3">
                  <span>{nudgeSentence(signalLabel(key), f)}</span>
                  <span className={`num shrink-0 font-semibold ${f > 1 ? "text-won" : "text-lost"}`}>× {f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate">Based on {outcomes} homes you marked won, lost or skipped. Updated every night.</p>
          </>
        ) : (
          <p className="text-sm text-slate">
            {outcomes < MIN_OUTCOMES
              ? `Mark homes won, lost or skipped and we'll fine-tune what matters. ${outcomes} of ${MIN_OUTCOMES} so far.`
              : "Your wins and losses look alike on every signal so far, so nothing has been nudged."}
          </p>
        )}
        {nudges.length || learned.learned_since ? <div className="mt-4"><ResetLearnedButton /></div> : null}
      </Card>

      <h2 className="mb-2 mt-8 text-lg font-bold">History</h2>
      <Card className="divide-y divide-line">
        {versions.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold">
                {SOURCE_LABEL[v.source] ?? v.source}
                {v.active ? <Badge tone="won">In use</Badge> : null}
              </div>
              <div className="text-sm text-slate">
                {when(v.created_at)} · {v.recipe.label} · {Object.keys(v.recipe.signals).length} signals
                {v.note ? ` · "${v.note}"` : ""}
              </div>
            </div>
            {v.active ? null : <UseVersionButton versionId={v.id} />}
          </div>
        ))}
      </Card>
    </>
  );
}
