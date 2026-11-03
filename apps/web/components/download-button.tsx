"use client";
import { useState } from "react";
import { withBase } from "@216leads/shared";
import { buttonClass } from "./ui";

type Variant = Parameters<typeof buttonClass>[0];

/**
 * A file download (PDF, CSV) that shows the server's message next to the button when it fails.
 * A plain link opened the error as a blank page of JSON (issue #72).
 */
export function DownloadButton({ href, children, variant = "secondary", className }: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withBase(href));
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Download failed (${res.status}). Try again.`);
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex flex-col items-end ${className ?? ""}`}>
      <button type="button" className={buttonClass(variant)} onClick={() => void download()} disabled={busy}>
        {busy ? "Preparing..." : children}
      </button>
      {error ? <span role="alert" className="mt-1 max-w-xs text-right text-sm text-lost">{error}</span> : null}
    </span>
  );
}
