"use client";
import { useState } from "react";
import Link from "next/link";
import { withBase } from "@216leads/shared";

/** One-time notice when the terms or privacy policy change (issue #3). */
export function TermsBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-2 border-b border-line bg-navy-50 px-4 py-1 text-xs">
      <span>We updated our <Link href="/terms" className="font-semibold underline">terms</Link> and <Link href="/privacy" className="font-semibold underline">privacy policy</Link>.</span>
      <button type="button" className="focus-ring tap shrink-0 rounded-[10px] px-2 text-xs font-semibold text-navy underline underline-offset-2"
        onClick={() => { setHidden(true); void fetch(withBase("/api/legal/accept"), { method: "POST" }); }}>OK</button>
    </div>
  );
}
