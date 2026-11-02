import type { ReactNode } from "react";
import { appEnv } from "@216leads/shared";
import { legalDoc, Markdown, type LegalPage } from "@/lib/content";

/** A legal page from content/legal/*.mdx (issue #3), with the draft note outside production. */
export function LegalView({ page, children }: { page: LegalPage; children?: ReactNode }) {
  const d = legalDoc(page);
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {d.status === "draft" && appEnv() !== "production" ? (
        <p role="note" className="mb-6 rounded-[10px] border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-900">Draft text, pending legal review (version {d.version}).</p>
      ) : null}
      <h1 className="text-3xl font-extrabold tracking-tight">{d.title}</h1>
      <p className="mb-6 mt-1 text-sm text-slate">Last updated {d.last_updated} · version {d.version}</p>
      <Markdown body={d.body} />
      {children}
    </article>
  );
}

export function legalMetadata(page: LegalPage) {
  return { title: legalDoc(page).title };
}
