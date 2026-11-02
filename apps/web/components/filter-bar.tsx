"use client";
// Lead list controls (spec 9.2): search, filter chips, sort and the status view, all kept in the URL.
import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";

const CHIPS = [
  { key: "score70", label: "Score 70+" },
  { key: "sold", label: "Just sold" },
  { key: "neighbors", label: "Neighbors" },
  { key: "citation", label: "Citation" },
  { key: "new_week", label: "New this week" },
];
const VIEWS = [
  { key: "active", label: "Active" }, { key: "won", label: "Won" }, { key: "lost", label: "Lost" },
  { key: "skipped", label: "Skipped" }, { key: "all", label: "All" },
];
const SORTS = [{ key: "score", label: "Score" }, { key: "newest", label: "Newest trigger" }, { key: "value", label: "Home value" }];

export function FilterBar({ counts }: { counts?: Partial<Record<string, number>> }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const chips = new Set((sp.get("chips") ?? "").split(",").filter(Boolean));
  const view = sp.get("view") ?? "active";

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  }

  // Search as you type (debounced).
  useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    const t = setTimeout(() => go({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="sticky top-[49px] z-10 -mx-4 mb-4 space-y-2 border-b border-line bg-paper/95 px-4 pb-3 pt-1 backdrop-blur md:top-0 md:mx-0 md:px-0" aria-busy={pending}>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search address or town</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address or town"
            className="focus-ring tap w-full rounded-[10px] border border-line bg-white pl-9 pr-3 text-base" />
        </label>
        <label>
          <span className="sr-only">Sort by</span>
          <select value={sp.get("sort") ?? "score"} onChange={(e) => go({ sort: e.target.value === "score" ? null : e.target.value })}
            className="focus-ring tap rounded-[10px] border border-line bg-white px-2 text-sm font-semibold text-navy">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label="Filters">
        {CHIPS.map((c) => {
          const on = chips.has(c.key);
          return (
            <button key={c.key} type="button" aria-pressed={on}
              onClick={() => {
                const next = new Set(chips);
                if (on) next.delete(c.key);
                else next.add(c.key);
                go({ chips: [...next].join(",") || null });
              }}
              className={clsx("focus-ring min-h-[36px] shrink-0 rounded-full border px-3 text-sm font-semibold",
                on ? "border-navy bg-navy text-white" : "border-line bg-white text-slate hover:text-navy")}>
              {c.label}
            </button>
          );
        })}
      </div>
      <nav className="flex gap-4 overflow-x-auto text-sm" aria-label="Lead status">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" aria-current={view === v.key ? "page" : undefined} onClick={() => go({ view: v.key === "active" ? null : v.key })}
            className={clsx("focus-ring shrink-0 border-b-2 py-1 font-semibold", view === v.key ? "border-signal text-navy" : "border-transparent text-slate hover:text-navy")}>
            {v.label}{counts?.[v.key] !== undefined ? <span className="num ml-1 text-xs text-slate">{counts[v.key]!.toLocaleString("en-US")}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
