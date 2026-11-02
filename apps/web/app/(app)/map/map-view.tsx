"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { Lasso, X } from "lucide-react";
import { circlePolygon, pointInPolygon, POSTCARD_PRICE_CENTS, titleCase, withBase, type Pt } from "@216leads/shared";
import type { EventPoint, HeatCell, LeadPoint, NeighborRing } from "@216leads/ingest";
import { Button, Card, LinkButton, Select } from "@/components/ui";
import { ScoreChip } from "@/components/lead-bits";
import { MAP_SELECTION_KEY } from "@/lib/map-selection";

type LayerKey = "leads" | "permit" | "sale" | "violation" | "flood" | "heat";
type Bbox = [number, number, number, number];
type FC<P> = { type: "FeatureCollection"; features: { type: "Feature"; geometry: { type: string; coordinates: Pt }; properties: P }[]; truncated?: boolean };

const LAYERS: { key: LayerKey; label: string; swatch: string }[] = [
  { key: "leads", label: "Leads", swatch: "#f26b1d" },
  { key: "permit", label: "Permits", swatch: "#6d28d9" },
  { key: "sale", label: "Sales", swatch: "#0e7490" },
  { key: "violation", label: "Violations", swatch: "#b42318" },
  { key: "flood", label: "Flood zones", swatch: "#2563eb" },
  { key: "heat", label: "Heat", swatch: "#fdba74" },
];
const EVENT_COLOR: Record<string, string> = { permit: "#6d28d9", sale: "#0e7490", violation: "#b42318" };
const KIND_LABEL: Record<string, string> = { permit: "Permit", sale: "Sale", violation: "City violation" };
const LASSO_MAX = 500;
const empty = { type: "FeatureCollection" as const, features: [] };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(withBase(path));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't load that layer");
  return data as T;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function MapView({ styleUrl, extent, categories, tradeCategory, credits, initialRing }: {
  styleUrl: string; extent: Bbox; categories: { key: string; label: string }[]; tradeCategory: string | null; credits: number; initialRing: string | null;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const leadsRef = useRef<FC<LeadPoint>["features"]>([]);
  const loaded = useRef(new Map<string, string>()); // layer -> query it was loaded with
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [on, setOn] = useState<Record<LayerKey, boolean>>({ leads: true, permit: false, sale: false, violation: false, flood: false, heat: false });
  const [category, setCategory] = useState(tradeCategory ?? "");
  const [days, setDays] = useState(90);
  const [heatKind, setHeatKind] = useState<"permit" | "sale" | "violation">("permit");
  const [leadCount, setLeadCount] = useState<{ n: number; truncated: boolean } | null>(null);
  const [selected, setSelected] = useState<LeadPoint | null>(null);
  const [event, setEvent] = useState<EventPoint | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [path, setPath] = useState<Pt[]>([]);
  const [lasso, setLasso] = useState<{ ids: string[]; over: boolean } | null>(null);
  const [ring, setRing] = useState<NeighborRing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = (id: string) => mapRef.current?.getSource(id) as GeoJSONSource | undefined;

  async function openRing(parcelKey: string) {
    setError(null);
    try {
      const r = await getJson<NeighborRing>(`/api/parcels/${encodeURIComponent(parcelKey)}/neighbors`);
      const c: Pt = [r.center.lon, r.center.lat];
      source("ring-area")?.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circlePolygon(c, r.radius_m)] } });
      source("ring-homes")?.setData({
        type: "FeatureCollection",
        features: r.homes.map((h) => ({ type: "Feature", properties: { lead: !!h.lead_id, skip: h.mailed_recently || h.opted_out }, geometry: { type: "Point", coordinates: [h.lon, h.lat] } })),
      });
      mapRef.current?.flyTo({ center: c, zoom: 16.5 });
      setRing(r);
      setSelected(null);
      setLasso(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function closeRing() {
    source("ring-area")?.setData(empty);
    source("ring-homes")?.setData(empty);
    setRing(null);
  }

  useEffect(() => {
    let map: MlMap | undefined;
    let dead = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        // MapLibre 6 runs a module worker; webpack emits it as an asset under the app's base path.
        ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
        if (dead || !box.current) return;
        map = new ml.Map({ container: box.current, style: styleUrl, bounds: extent, fitBoundsOptions: { padding: 24 }, attributionControl: { compact: true } });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        // If the basemap style can't be fetched, fall back to a plain background so pins and tools still work.
        let fellBack = false;
        map.on("error", () => {
          if (fellBack || !map || map.isStyleLoaded()) return;
          fellBack = true;
          map.setStyle({ version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#f7f5f0" } }] });
        });
        map.on("load", () => {
          if (!map) return;
          addLayers(map);
          setStatus("ready");
          getJson<FC<LeadPoint>>("/api/map/points")
            .then((fc) => {
              leadsRef.current = fc.features;
              source("leads")?.setData(fc as never);
              setLeadCount({ n: fc.features.length, truncated: !!fc.truncated });
            })
            .catch((e) => setError(e.message));
          if (initialRing) void openRing(initialRing);
        });
        const clickable = ["leads", "ev-permit", "ev-sale", "ev-violation"];
        for (const id of clickable) {
          map.on("mouseenter", id, () => (map!.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", id, () => (map!.getCanvas().style.cursor = ""));
        }
        map.on("click", (e) => {
          const hit = map!.queryRenderedFeatures(e.point, { layers: clickable.filter((id) => map!.getLayer(id)) })[0];
          if (!hit) {
            setSelected(null);
            setEvent(null);
            return;
          }
          if (hit.layer.id === "leads") {
            setSelected(hit.properties as LeadPoint);
            setEvent(null);
          } else {
            setEvent(hit.properties as EventPoint);
            setSelected(null);
          }
        });
      } catch {
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; props are fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load and show/hide record layers when toggles or filters change.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    const vis = (id: string, v: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    vis("leads", on.leads);
    vis("leads-picked", on.leads);
    for (const kind of ["permit", "sale", "violation"] as const) {
      vis(`ev-${kind}`, on[kind]);
      const q = `kind=${kind}&days=${days}${kind === "permit" && category ? `&category=${category}` : ""}`;
      if (on[kind] && loaded.current.get(kind) !== q) {
        loaded.current.set(kind, q);
        getJson<FC<EventPoint>>(`/api/map/layer?${q}`).then((fc) => source(`ev-${kind}`)?.setData(fc as never)).catch((e) => setError(e.message));
      }
    }
    vis("flood-fill", on.flood);
    vis("flood-line", on.flood);
    if (on.flood && !loaded.current.has("flood")) {
      loaded.current.set("flood", "1");
      getJson<FC<unknown>>(`/api/map/layer?kind=flood&bbox=${extent.join(",")}`).then((fc) => source("flood")?.setData(fc as never)).catch((e) => setError(e.message));
    }
    vis("heat", on.heat);
    map.setPaintProperty("leads", "circle-opacity", on.heat ? 0.35 : 1);
    const hq = `kind=${heatKind}&days=${days}`;
    if (on.heat && loaded.current.get("heat") !== hq) {
      loaded.current.set("heat", hq);
      getJson<{ cells: HeatCell[] }>(`/api/map/heat?${hq}`)
        .then(({ cells }) => {
          const max = Math.max(1, ...cells.map((c) => c.count));
          map.setPaintProperty("heat", "heatmap-weight", ["interpolate", ["linear"], ["get", "count"], 0, 0, max, 1]);
          source("heat")?.setData({ type: "FeatureCollection", features: cells.map((c) => ({ type: "Feature", properties: { count: c.count }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })) });
        })
        .catch((e) => setError(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, on, category, days, heatKind]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    map.setFilter("leads-picked", ["in", ["get", "id"], ["literal", lasso?.ids ?? []]]);
    if (drawing) map.dragPan.disable();
    else map.dragPan.enable();
  }, [status, lasso, drawing]);

  function local(e: ReactPointerEvent): Pt {
    const r = box.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function finishLasso() {
    const map = mapRef.current;
    setDrawing(false);
    if (!map || path.length < 3) {
      setPath([]);
      return;
    }
    const inside = leadsRef.current.filter((f) => {
      if (f.properties.status === "won") return false;
      const p = map.project(f.geometry.coordinates);
      return pointInPolygon([p.x, p.y], path);
    });
    setPath([]);
    setLasso({ ids: inside.slice(0, LASSO_MAX).map((f) => f.properties.id), over: inside.length > LASSO_MAX });
    setSelected(null);
    closeRing();
  }

  function mailLasso() {
    if (!lasso?.ids.length) return;
    try {
      sessionStorage.setItem(MAP_SELECTION_KEY, JSON.stringify(lasso.ids));
      router.push("/mail/send?from=map");
    } catch {
      // No session storage (private mode): fall back to the URL, which holds the first 100 homes.
      router.push(`/mail/send?leads=${lasso.ids.slice(0, 100).join(",")}`);
    }
  }

  const n = lasso?.ids.length ?? 0;
  const creditPart = Math.min(n, credits);
  const meteredPart = n - creditPart;

  if (status === "error") {
    return (
      <Card className="p-6 text-center">
        <p className="font-semibold">This browser can&apos;t show the map.</p>
        <p className="mt-1 text-sm text-slate">All your homes are on the <Link className="underline" href="/leads">Leads</Link> tab.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Map layers">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={on[l.key]}
            onClick={() => setOn((s) => ({ ...s, [l.key]: !s[l.key] }))}
            className={clsx(
              "focus-ring tap inline-flex items-center gap-2 rounded-full border px-3 text-sm font-semibold",
              on[l.key] ? "border-navy bg-navy text-white" : "border-line bg-white text-slate hover:text-navy",
            )}
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: l.swatch }} />
            {l.label}
          </button>
        ))}
        <Button
          type="button"
          variant={drawing ? "primary" : "secondary"}
          className="ml-auto"
          aria-pressed={drawing}
          disabled={status !== "ready"}
          onClick={() => { setDrawing((d) => !d); setPath([]); }}
        >
          <Lasso className="h-4 w-4" aria-hidden /> {drawing ? "Draw around homes…" : "Draw to mail"}
        </Button>
      </div>

      {on.permit || on.sale || on.violation || on.heat ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate">Last</span>
            <Select aria-label="Time window" value={days} onChange={(e) => setDays(Number(e.target.value))} className="max-w-48">
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>12 months</option>
            </Select>
          </label>
          {on.permit ? (
            <Select aria-label="Permit category" value={category} onChange={(e) => setCategory(e.target.value)} className="max-w-48">
              <option value="">All permits</option>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          ) : null}
          {on.heat ? (
            <Select aria-label="Heat shows" value={heatKind} onChange={(e) => setHeatKind(e.target.value as typeof heatKind)} className="max-w-48">
              <option value="permit">Heat: permits</option>
              <option value="sale">Heat: sales</option>
              <option value="violation">Heat: violations</option>
            </Select>
          ) : null}
        </div>
      ) : null}

      <div className="card relative h-[calc(100dvh-300px)] min-h-[420px] overflow-hidden p-0 md:h-[620px]">
        {/* MapLibre's CSS makes its container position: relative, so it sits inside the absolute box. */}
        <div className="absolute inset-0">
          <div ref={box} className="h-full w-full" data-testid="map" data-ready={status === "ready" && leadCount ? "true" : undefined} />
        </div>
        {drawing ? (
          <div
            className="absolute inset-0 z-10 cursor-crosshair touch-none"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setPath([local(e)]); }}
            onPointerMove={(e) => {
              if (!path.length) return;
              const p = local(e);
              const last = path[path.length - 1]!;
              if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 4) setPath((s) => [...s, p]);
            }}
            onPointerUp={finishLasso}
          >
            <svg className="h-full w-full" aria-hidden>
              <polygon points={path.map((p) => p.join(",")).join(" ")} fill="rgba(242,107,29,0.15)" stroke="#f26b1d" strokeWidth={2} strokeDasharray="6 4" />
            </svg>
          </div>
        ) : null}
        {status === "loading" ? <div className="absolute inset-0 grid place-items-center bg-paper/70 text-sm text-slate">Loading the map…</div> : null}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate" aria-label="Legend">
        <span><Dot c="#f26b1d" /> Score 80+</span>
        <span><Dot c="#0f2a44" /> 65–79</span>
        <span><Dot c="#8aa1b8" /> Under 65</span>
        <span><Dot c="#2e7d4f" /> Won job (tap for the neighbor ring)</span>
        {leadCount ? <span className="ml-auto">{leadCount.n.toLocaleString()} homes{leadCount.truncated ? " (your top 5,000)" : ""}</span> : null}
      </div>

      {error ? <p role="alert" className="text-sm text-lost">{error}</p> : null}

      {lasso ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4" role="status">
          <div>
            <div className="font-bold">{n ? `Mail these ${n} home${n === 1 ? "" : "s"}` : "No open leads inside that shape"}</div>
            {n ? (
              <div className="text-sm text-slate">
                About {creditPart} credit{creditPart === 1 ? "" : "s"}{meteredPart ? ` + ${money(meteredPart * POSTCARD_PRICE_CENTS)}` : ""} before checks
                {lasso.over ? ` · first ${LASSO_MAX} only` : ""}. The next screen removes homes that opted out or were mailed in the last 30 days.
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setLasso(null)}>Clear</Button>
            {n ? <Button onClick={mailLasso}>Mail these {n}</Button> : null}
          </div>
        </Card>
      ) : null}

      {ring ? (
        <Card className="p-4" role="status">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate">Neighbor ring · {ring.radius_m} m</div>
              <div className="font-mono font-bold">{titleCase(ring.center.address)}</div>
            </div>
            <button type="button" className="focus-ring tap rounded-full p-2 text-slate" aria-label="Close neighbor ring" onClick={closeRing}><X className="h-5 w-5" /></button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Homes around it" value={ring.counts.homes} />
            <Stat label="Already your leads" value={ring.counts.leads} />
            <Stat label="Mailed last 30 days" value={ring.counts.mailed_recently} />
            <Stat label="Opted out" value={ring.counts.opted_out} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {ring.counts.mailable ? (
              <LinkButton href={`/mail/send?parcels=${ring.homes.map((h) => h.parcel_key).join(",")}`}>Mail the ring ({ring.counts.mailable})</LinkButton>
            ) : <p className="text-sm text-slate">Every home around this one was mailed recently or opted out.</p>}
            {ring.center.lead_id ? <LinkButton variant="secondary" href={`/leads/${ring.center.lead_id}`}>Open the job</LinkButton> : null}
          </div>
        </Card>
      ) : null}

      {selected ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <ScoreChip score={Number(selected.score)} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono font-bold">{titleCase(selected.address)}</div>
            <div className="text-sm text-slate">{titleCase(selected.city)}{selected.trigger ? ` · ${selected.trigger}` : ""}{selected.status === "won" ? " · Won" : ""}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton variant="secondary" href={`/leads/${selected.id}`}>Open</LinkButton>
            <Button variant={selected.status === "won" ? "primary" : "secondary"} onClick={() => openRing(selected.parcel_key)}>Neighbor ring</Button>
            {selected.status !== "won" ? <LinkButton href={`/mail/send?leads=${selected.id}`}>Mail</LinkButton> : null}
          </div>
        </Card>
      ) : null}

      {event ? (
        <Card className="p-4 text-sm">
          <div className="font-semibold">{KIND_LABEL[event.kind]} · {event.date}</div>
          <div className="font-mono">{titleCase(event.address)}</div>
          <div className="text-slate">
            {[event.category ? categories.find((c) => c.key === event.category)?.label ?? event.category : null,
              event.business ? titleCase(event.business) : null,
              event.amount ? `$${Number(event.amount).toLocaleString()}` : null].filter(Boolean).join(" · ")}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c }} />;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-navy-50 px-3 py-2">
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="num text-lg font-bold">{value}</dd>
    </div>
  );
}

/** Sources and layers, bottom to top: flood, heat, records, ring, leads. */
function addLayers(map: MlMap) {
  for (const id of ["flood", "heat", "ev-permit", "ev-sale", "ev-violation", "ring-area", "ring-homes", "leads"]) {
    map.addSource(id, { type: "geojson", data: empty });
  }
  const hidden = { visibility: "none" as const };
  map.addLayer({ id: "flood-fill", type: "fill", source: "flood", layout: hidden, paint: { "fill-color": "#2563eb", "fill-opacity": 0.16 } });
  map.addLayer({ id: "flood-line", type: "line", source: "flood", layout: hidden, paint: { "line-color": "#2563eb", "line-width": 1 } });
  map.addLayer({
    id: "heat", type: "heatmap", source: "heat", layout: hidden,
    paint: {
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 18, 15, 50],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 1, 15, 2],
      "heatmap-opacity": 0.75,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(253,238,228,0)", 0.3, "#fdba74", 0.6, "#f26b1d", 1, "#b42318"],
    },
  });
  for (const kind of ["permit", "sale", "violation"]) {
    map.addLayer({
      id: `ev-${kind}`, type: "circle", source: `ev-${kind}`, layout: hidden,
      paint: {
        "circle-color": EVENT_COLOR[kind]!, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 6],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.85,
      },
    });
  }
  map.addLayer({ id: "ring-area-fill", type: "fill", source: "ring-area", paint: { "fill-color": "#2e7d4f", "fill-opacity": 0.08 } });
  map.addLayer({ id: "ring-area-line", type: "line", source: "ring-area", paint: { "line-color": "#2e7d4f", "line-width": 2, "line-dasharray": [2, 1] } });
  map.addLayer({
    id: "leads", type: "circle", source: "leads",
    paint: {
      "circle-color": ["case", ["==", ["get", "status"], "won"], "#2e7d4f", [">=", ["get", "score"], 80], "#f26b1d", [">=", ["get", "score"], 65], "#0f2a44", "#8aa1b8"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, ["case", ["==", ["get", "status"], "won"], 5, 3], 16, ["case", ["==", ["get", "status"], "won"], 10, 7]],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "leads-picked", type: "circle", source: "leads", filter: ["in", ["get", "id"], ["literal", []]],
    paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 16, 11], "circle-stroke-color": "#f26b1d", "circle-stroke-width": 2.5 },
  });
  map.addLayer({
    id: "ring-homes", type: "circle", source: "ring-homes",
    paint: {
      "circle-color": ["case", ["get", "skip"], "#e3e0d8", "#ffffff"], "circle-radius": 5,
      "circle-stroke-color": ["case", ["get", "lead"], "#f26b1d", "#2e7d4f"], "circle-stroke-width": 2,
    },
  });
}
