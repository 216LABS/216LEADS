"use client";
// Plan cards (spec 9.9 PlanCard, spec 11 prices). Picking one starts Stripe Checkout; the founding
// offer line shows only while spots remain (issue #5).
import clsx from "clsx";
import { useState } from "react";
import { FOUNDING_PRO_MONTHLY, FOUNDING_SPOTS, PLANS, withBase } from "@216leads/shared";
import { Badge, Button, Card, SegmentedControl } from "./ui";

export function PlanCards({ current, foundingLeft, canBuy, billingOn }: { current: string; foundingLeft: number; canBuy: boolean; billingOn: boolean }) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(plan: string) {
    setBusy(plan);
    setError(null);
    const res = await fetch(withBase("/api/billing/checkout"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, interval }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) return window.location.assign(data.url);
    setBusy(null);
    setError(data.error ?? "Could not start checkout");
  }

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <SegmentedControl label="Billing period" value={interval} onChange={setInterval}
          options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly (2 months free)" }]} />
      </div>
      {foundingLeft > 0 && interval === "month" ? (
        <p className="rounded-[6px] bg-signal-50 px-4 py-2 text-sm text-signal-600">
          Founding offer: Pro ${FOUNDING_PRO_MONTHLY}/mo for life, {foundingLeft} of {FOUNDING_SPOTS} spots left.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.values(PLANS).map((p) => {
          const isCurrent = current === p.key;
          const price = interval === "month" ? p.monthly : p.annual;
          const founding = p.key === "pro" && interval === "month" && foundingLeft > 0;
          return (
            <Card key={p.key} className={clsx("flex flex-col p-5", isCurrent && "border-navy")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{p.label}</h3>
                {isCurrent ? <Badge tone="navy">Current plan</Badge> : null}
              </div>
              <p className="mt-1">
                {founding ? <span className="num mr-1 text-slate line-through">${p.monthly}</span> : null}
                <span className="num text-title font-semibold">${founding ? FOUNDING_PRO_MONTHLY : price.toLocaleString("en-US")}</span>
                <span className="text-sm text-slate">/{interval === "month" ? "mo" : "yr"}</span>
              </p>
              <ul className="mt-4 flex-1 list-disc space-y-1 pl-4 text-sm text-slate marker:text-signal">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              {canBuy ? (
                <Button type="button" className="mt-4" variant={isCurrent ? "secondary" : "primary"} disabled={!billingOn || isCurrent || busy !== null}
                  onClick={() => void choose(p.key)}>
                  {isCurrent ? "Your plan" : busy === p.key ? "Opening checkout…" : `Choose ${p.label}`}
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-slate">
        Postcards beyond your monthly credits are $0.99 each. If you don&rsquo;t book a job from 216 HomeSignal in your first 60 days, we refund month 2.
        {foundingLeft > 0 ? " The founding price stays while you stay on Pro monthly; switching plans drops it." : ""}
      </p>
      {!billingOn ? <p className="text-sm text-slate" role="status">Plans open soon. Your trial keeps running until then.</p> : null}
      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}
    </div>
  );
}
