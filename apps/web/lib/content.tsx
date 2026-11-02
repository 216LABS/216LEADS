// Editable page content (issues #3, #7): `content/**/*.mdx` files with a frontmatter block.
// The bodies are plain Markdown (headings, paragraphs, lists, **bold**, [links](/path)); they are
// rendered to React elements here, never as raw HTML, so editing text needs no code change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";

export interface ContentDoc {
  title: string;
  version: string;
  status: "draft" | "final";
  last_updated: string;
  body: string;
}

export const LEGAL_PAGES = ["terms", "privacy", "data", "refunds"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export function parseDoc(raw: string): ContentDoc {
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    title: meta.title ?? "",
    version: meta.version ?? "0",
    status: meta.status === "final" ? "final" : "draft",
    last_updated: meta.last_updated ?? "",
    body: (m?.[2] ?? raw).trim(),
  };
}

export function loadDoc(name: string): ContentDoc {
  return parseDoc(readFileSync(join(process.cwd(), "content", `${name}.mdx`), "utf8"));
}

export const legalDoc = (p: LegalPage) => loadDoc(`legal/${p}`);

/** Current terms + privacy versions, for acceptance rows and the "terms changed" banner. */
export function legalVersions(): { terms: string; privacy: string } {
  return { terms: legalDoc("terms").version, privacy: legalDoc("privacy").version };
}

function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}-${i++}`}>{m[1]}</strong>);
    else {
      const href = m[3]!;
      out.push(href.startsWith("/")
        ? <Link key={`${key}-${i++}`} href={href} className="font-semibold text-navy underline underline-offset-2">{m[2]}</Link>
        : <a key={`${key}-${i++}`} href={/^https?:|^mailto:/.test(href) ? href : "#"} className="font-semibold text-navy underline underline-offset-2">{m[2]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Markdown({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.startsWith("### ")) return <h3 key={k} className="pt-2 font-bold">{inline(b.slice(4), k)}</h3>;
        if (b.startsWith("## ")) return <h2 key={k} className="pt-3 text-lg font-bold">{inline(b.slice(3), k)}</h2>;
        if (b.startsWith("# ")) return <h1 key={k} className="text-2xl font-bold">{inline(b.slice(2), k)}</h1>;
        if (/^- /m.test(b) && b.split("\n").every((l) => l.startsWith("- "))) {
          return <ul key={k} className="list-disc space-y-1 pl-5">{b.split("\n").map((l, j) => <li key={j}>{inline(l.slice(2), `${k}-${j}`)}</li>)}</ul>;
        }
        return <p key={k} className="text-slate">{inline(b.replace(/\n/g, " "), k)}</p>;
      })}
    </div>
  );
}
