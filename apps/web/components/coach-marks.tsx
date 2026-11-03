"use client";
// Three first-visit coach marks on Leads (spec 9.1): score chip, "why this home", status pill.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@216leads/shared";
import { Button } from "./ui";

const TIPS = [
  { title: "The score", body: "0 to 100: how well a home fits the homes you want right now. Orange chips (80+) are the best bets." },
  { title: "Why this home", body: "Every lead lists the public records behind it: permits, sales, city notices. Open a lead to see each source." },
  { title: "Status", body: "Track each home from New to Contacted, Quoted, Won or Lost. Swipe a card right for contacted, left to skip." },
];

export function CoachMarks() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  if (!open) return null;

  async function done() {
    setOpen(false);
    await fetch(withBase("/api/settings/coach-marks"), { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  const tip = TIPS[i]!;
  return (
    <aside className="mb-4 flex flex-col gap-2 rounded-[10px] md:flex-row md:items-center md:gap-4 border border-signal/30 bg-signal-50 px-4 py-2" aria-label="Getting started" aria-live="polite">
      <p className="min-w-0 flex-1 text-sm">
        <span className="text-xs text-signal-600">Tip {i + 1} of {TIPS.length} · </span>
        <span className="font-semibold">{tip.title}:</span> <span className="text-slate">{tip.body}</span>
      </p>
      <div className="flex gap-2">
        {i < TIPS.length - 1 ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setI(i + 1)}>Next tip</Button>
            <Button type="button" variant="ghost" onClick={() => void done()}>Skip tips</Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={() => void done()}>Got it</Button>
        )}
      </div>
    </aside>
  );
}
