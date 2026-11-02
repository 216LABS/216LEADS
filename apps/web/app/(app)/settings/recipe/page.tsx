import Link from "next/link";
import { getDirectSql, getSql } from "@216leads/db";
import { categoryMatchCounts, ensurePresetVersion, listRecipeVersions, loadOrgProfile } from "@216leads/ingest";
import { signalLabel, triggerSentence } from "@216leads/scoring";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireOrg } from "@/lib/session";
import { UseVersionButton } from "./use-version";

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
  const [{ template, profile }, versions, counts] = await Promise.all([
    loadOrgProfile(sql, org.id),
    listRecipeVersions(sql, org.id),
    categoryMatchCounts(sql),
  ]);
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
