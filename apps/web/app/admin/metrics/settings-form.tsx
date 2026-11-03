"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button, Card, Input, Label } from "@/components/ui";

export function MetricsSettings({ monthlyCost, inactiveDays, unopenedWeeks }: { monthlyCost: number | null; inactiveDays: number; unopenedWeeks: number }) {
  const router = useRouter();
  const [cost, setCost] = useState(monthlyCost === null ? "" : String(monthlyCost));
  const [days, setDays] = useState(inactiveDays);
  const [weeks, setWeeks] = useState(unopenedWeeks);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const res = await fetch(withBase("/api/admin/metrics/settings"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_cost: cost.trim() === "" ? null : Number(cost), inactive_days: days, unopened_weeks: weeks }),
    });
    setMsg(res.ok ? "Saved." : "Could not save");
    router.refresh();
  }
  return (
    <Card className="mt-8 space-y-3 p-5">
      <h2 className="font-semibold">Settings</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label htmlFor="m-cost" hint="Data + infra, dollars">Monthly cost</Label><Input id="m-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 85" /></div>
        <div><Label htmlFor="m-days">Inactive after (days)</Label><Input id="m-days" type="number" min={1} max={120} value={days} onChange={(e) => setDays(Number(e.target.value) || 14)} /></div>
        <div><Label htmlFor="m-weeks">Digest unopened (weeks)</Label><Input id="m-weeks" type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) || 3)} /></div>
      </div>
      <div className="flex items-center gap-3"><Button type="button" onClick={() => void save()}>Save settings</Button>{msg ? <p role="status" className="text-sm text-slate">{msg}</p> : null}</div>
    </Card>
  );
}
