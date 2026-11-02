// Small geometry helpers for the map's lasso and neighbor ring (spec 9.3).

export type Pt = [number, number];

/** Ray-casting test; works for screen pixels or lon/lat. The polygon may be open or closed. */
export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A closed lon/lat ring approximating a circle of `radiusM` metres, for drawing the neighbor ring. */
export function circlePolygon([lon, lat]: Pt, radiusM: number, steps = 64): Pt[] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]!);
  return ring;
}
