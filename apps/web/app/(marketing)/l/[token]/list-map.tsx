"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { COLORS } from "@/lib/theme";

/** Pins for a shared prospect list (issue #6): score-colored dots, no popups with extra data. */
export function ListMap({ points, styleUrl }: { points: { lon: number; lat: number; score: number }[]; styleUrl: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!points.length) return;
    let map: MlMap | undefined;
    let dead = false;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      if (dead || !box.current) return;
      const lons = points.map((p) => p.lon);
      const lats = points.map((p) => p.lat);
      map = new ml.Map({
        container: box.current, style: styleUrl, attributionControl: { compact: true },
        bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], fitBoundsOptions: { padding: 32, maxZoom: 15 },
      });
      let fellBack = false;
      map.on("error", () => {
        if (fellBack || !map || map.isStyleLoaded()) return;
        fellBack = true;
        map.setStyle({ version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": COLORS.paper } }] });
      });
      map.on("load", () => {
        if (!map) return;
        map.addSource("homes", { type: "geojson", data: { type: "FeatureCollection", features: points.map((p) => ({ type: "Feature", properties: { score: p.score }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) } });
        map.addLayer({ id: "homes", type: "circle", source: "homes", paint: {
          "circle-radius": 6, "circle-stroke-width": 1.5, "circle-stroke-color": COLORS.white,
          "circle-color": ["case", [">=", ["get", "score"], 80], COLORS.signal600, [">=", ["get", "score"], 65], COLORS.navy, COLORS.mutedPin],
        } });
      });
    })().catch(() => undefined);
    return () => {
      dead = true;
      map?.remove();
    };
  }, [points, styleUrl]);
  if (!points.length) return null;
  return <div ref={box} className="h-72 w-full overflow-hidden rounded-[12px] border border-line" role="img" aria-label={`Map of ${points.length} homes`} />;
}
