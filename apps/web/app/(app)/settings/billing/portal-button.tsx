"use client";
import { useState } from "react";
import { withBase } from "@216leads/shared";
import { Button } from "@/components/ui";

export function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        const res = await fetch(withBase("/api/billing/portal"), { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) return window.location.assign(data.url);
        setBusy(false);
        setError(data.error ?? "Could not open billing");
      }}>
        {busy ? "Opening…" : "Change card, plan or cancel"}
      </Button>
      {error ? <p role="alert" className="mt-1 text-sm text-lost">{error}</p> : null}
    </>
  );
}
