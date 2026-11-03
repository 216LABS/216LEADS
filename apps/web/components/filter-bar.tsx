"use client";
// Lead list controls (spec 9.2): search, filter chips, sort and the status view, all kept in the URL.
import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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

export function FilterBar({ counts, extra }: { counts?: Partial<Record<string, number>>; extra?: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  // The filters as last tapped (issue #79). The page re-renders in a transition, so reading `sp` alone
  // made a second tap before that render undo the first. And two overlapping navigations can finish
  // out of order (the unfiltered page is cached, a filtered one is fetched), leaving the address bar
  // on the older filters. So only one navigation runs at a time: a tap while one is loading updates
  // the buttons at once, and `wanted` (the newest filters) is sent when the load finishes. The lead
  // list has no loading.tsx: under that boundary Next sometimes rendered new filters but left the
  // address bar on the old ones.
  const href = (query: string) => (query ? `${path}?${query}` : path);
  const [params, setParams] = useState(() => sp.toString());
  const wanted = useRef<string | null>(null);
  useEffect(() => {
    if (pending) return;
    const now = sp.toString();
    if (wanted.current === null || wanted.current === now) {
      wanted.current = null;
      setParams(now);
    } else {
      const want = wanted.current;
      start(() => router.replace(href(want), { scroll: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, pending]);
  const cur = new URLSearchParams(params);
  const chips = new Set((cur.get("chips") ?? "").split(",").filter(Boolean));
  const view = cur.get("view") ?? "active";

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    wanted.current = next.toString();
    setParams(next.toString());
    if (!pending) start(() => router.replace(href(next.toString()), { scroll: false }));
  }

  // Search as you type (debounced).
  useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    const t = setTimeout(() => go({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    // Sticks under the phone header, whose height is the --app-header-h variable set by the app shell.
    <div className="sticky top-[var(--app-header-h,0px)] z-10 -mx-4 mb-4 space-y-2 border-b border-line bg-paper/95 px-4 pb-2 pt-2 backdrop-blur md:top-0 md:mx-0 md:px-0" aria-busy={pending}>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search address or town</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address or town"
            className="focus-ring tap w-full rounded-[10px] border border-line bg-white pl-8 pr-2 text-base" />
        </label>
        <label>
          <span className="sr-only">Sort by</span>
          <select value={cur.get("sort") ?? "score"} onChange={(e) => go({ sort: e.target.value === "score" ? null : e.target.value })}
            className="focus-ring tap rounded-[10px] border border-line bg-white px-2 text-sm text-navy">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <nav className="flex gap-4 overflow-x-auto text-sm" aria-label="Lead status">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-current={view === v.key ? "page" : undefined} onClick={() => go({ view: v.key === "active" ? null : v.key })}
              className={clsx("focus-ring min-h-10 shrink-0 border-b-2", view === v.key ? "border-signal font-semibold text-navy" : "border-transparent text-slate hover:text-navy")}>
              {v.label}{counts?.[v.key] !== undefined ? <span className="num ml-1 text-xs text-slate">{counts[v.key]!.toLocaleString("en-US")}</span> : null}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="Filters">
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
                className={clsx("focus-ring min-h-10 shrink-0 rounded-full border px-4 text-sm",
                  on ? "border-navy bg-navy text-white" : "border-line bg-white text-slate hover:text-navy")}>
                {c.label}
              </button>
            );
          })}
          {extra ? <span className="ml-2 shrink-0">{extra}</span> : null}
          {/* Replaces the (list)/loading.tsx skeleton, which made Next drop URL updates (issue #79). */}
          {pending ? <span role="status" className="shrink-0 text-sm text-slate">Updating…</span> : null}
        </div>
      </div>
    </div>
  );
}
