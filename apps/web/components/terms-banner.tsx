"use client";
import { useState } from "react";
import Link from "next/link";
import { withBase } from "@216leads/shared";

/** One-time notice when the terms or privacy policy change (issue #3). */
export function TermsBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-navy-50 px-4 py-2 text-sm">
      <span>We updated our <Link href="/terms" className="font-semibold underline">terms</Link> and <Link href="/privacy" className="font-semibold underline">privacy policy</Link>.</span>
      <button type="button" className="focus-ring tap rounded-full bg-navy px-4 text-sm font-semibold text-white"
        onClick={() => { setHidden(true); void fetch(withBase("/api/legal/accept"), { method: "POST" }); }}>OK</button>
    </div>
  );
}
