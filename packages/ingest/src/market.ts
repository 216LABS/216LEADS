// M9 map and market tools (spec 8, 9.3): lead pins, record layers, heat grid, neighbor ring
// and competitor tracker. Everything is limited to the org's territory, like every other
// parcel read (decision 4); flood zones are public polygons with no parcel data.
import type { Sql } from "@216leads/db";
import { MAP_POINT_CAP, NO_REPEAT_DAYS } from "@216leads/shared";

/** [minLon, minLat, maxLon, maxLat] in WGS84. */
export type Bbox = [number, number, number, number];

/** Larger boxes are refused so a zoomed-out map can't scan the whole county. */
export const MAX_BBOX_DEG = 0.6;

export function parseBbox(raw: string | null | undefined): Bbox | null {
  if (!raw) return null;
  const n = raw.split(",").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const [a, b, c, d] = n as Bbox;
  if (a >= c || b >= d || a < -180 || c > 180 || b < -90 || d > 90) return null;
  return [a, b, c, d];
}

export function bboxTooLarge(b: Bbox): boolean {
  return b[2] - b[0] > MAX_BBOX_DEG || b[3] - b[1] > MAX_BBOX_DEG;
}

interface Feature<P> {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] } | Record<string, unknown>;
  properties: P;
}
export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: Feature<P>[];
  truncated?: boolean;
}

const point = (lon: number, lat: number) => ({ type: "Point" as const, coordinates: [lon, lat] as [number, number] });

export interface LeadPoint {
  id: string;
  parcel_key: string;
  score: number;
  status: string;
  address: string;
  city: string;
  trigger: string | null;
}

/** GET /api/map/points: the org's visible leads (open and won), best first, at most 5,000 (spec 13). */
export async function mapPoints(sql: Sql, orgId: string, o: { bbox?: Bbox | null; minScore?: number; limit?: number } = {}) {
  const limit = Math.min(o.limit ?? MAP_POINT_CAP, MAP_POINT_CAP);
  const b = o.bbox ?? null;
  const rows = await sql<(LeadPoint & { lon: number; lat: number })[]>`
    select l.id, l.parcel_key, l.score, l.status::text as status, p.addr_line as address, p.city, l.trigger_label as trigger,
      st_x(p.geom) as lon, st_y(p.geom) as lat
    from lead l join parcel p on p.parcel_key = l.parcel_key
    where l.org_id = ${orgId} and not l.hidden and l.visible_from <= now() and p.geom is not null
      and l.status in ('new', 'contacted', 'quoted', 'won') and l.score >= ${o.minScore ?? 0}
      and not exists (select 1 from suppression s where s.addr_norm = p.addr_norm)
      and (${b === null} or p.geom && st_makeenvelope(${b?.[0] ?? 0}, ${b?.[1] ?? 0}, ${b?.[2] ?? 0}, ${b?.[3] ?? 0}, 4326))
    order by l.score desc, l.id
    limit ${limit + 1}`;
  const fc: FeatureCollection<LeadPoint> = {
    type: "FeatureCollection",
    features: rows.slice(0, limit).map(({ lon, lat, ...p }) => ({ type: "Feature", geometry: point(lon, lat), properties: p })),
    truncated: rows.length > limit,
  };
  return fc;
}

export type LayerKind = "permit" | "sale" | "violation";
export const LAYER_KINDS: LayerKind[] = ["permit", "sale", "violation"];
export const LAYER_POINT_CAP = 2000;

export interface EventPoint {
  kind: LayerKind;
  date: string;
  category: string | null;
  address: string;
  /** Permits: the contractor's business name; never a person (decision 32). */
  business: string | null;
  /** Sales: arms-length price. */
  amount: number | null;
}

const kindFilter = (sql: Sql, kind: LayerKind) =>
  kind === "sale" ? sql`e.kind = 'sale' and e.arms_length` : sql`e.kind = ${kind}`;

/** Recent permits / sales / violations in the org's area, as map points (spec 9.3 layers). */
export async function eventLayer(sql: Sql, orgId: string, o: { kind: LayerKind; bbox?: Bbox | null; days?: number; category?: string | null }) {
  const days = Math.min(Math.max(o.days ?? 90, 1), 730);
  const b = o.bbox ?? null;
  const rows = await sql<(EventPoint & { lon: number; lat: number })[]>`
    select e.kind::text as kind, e.event_date::text as date, e.category, p.addr_line as address,
      case when c.is_individual then null else c.display_name end as business,
      case when e.kind = 'sale' then e.amount end as amount,
      st_x(p.geom) as lon, st_y(p.geom) as lat
    from parcel_event e
      join parcel p on p.parcel_key = e.parcel_key
      left join contractor c on c.id = e.contractor_id
    where ${kindFilter(sql, o.kind)} and e.event_date >= current_date - ${days}::int
      and (${o.category ?? null}::text is null or e.category = ${o.category ?? null})
      and (${b === null} or p.geom && st_makeenvelope(${b?.[0] ?? 0}, ${b?.[1] ?? 0}, ${b?.[2] ?? 0}, ${b?.[3] ?? 0}, 4326))
      and p.parcel_key in (select org_territory_parcels(${orgId}))
    order by e.event_date desc, e.id desc
    limit ${LAYER_POINT_CAP + 1}`;
  const fc: FeatureCollection<EventPoint> = {
    type: "FeatureCollection",
    features: rows.slice(0, LAYER_POINT_CAP).map(({ lon, lat, ...p }) => ({ type: "Feature", geometry: point(lon, lat), properties: p })),
    truncated: rows.length > LAYER_POINT_CAP,
  };
  return fc;
}

/** The bounding box of the org's homes, for fitting the map and fetching flood zones. */
export async function territoryExtent(sql: Sql, orgId: string): Promise<Bbox | null> {
  const [r] = await sql<{ x1: number | null; y1: number; x2: number; y2: number }[]>`
    select st_xmin(e) as x1, st_ymin(e) as y1, st_xmax(e) as x2, st_ymax(e) as y2
    from (select st_extent(p.geom)::geometry as e from parcel p where p.parcel_key in (select org_territory_parcels(${orgId}))) t`;
  return r?.x1 == null ? null : [r.x1, r.y1, r.x2, r.y2];
}

/** FEMA special flood hazard areas in view, clipped and simplified for display. */
export async function floodZones(sql: Sql, bbox: Bbox) {
  const [x1, y1, x2, y2] = bbox;
  const rows = await sql<{ zone: string | null; geojson: string }[]>`
    with env as (select st_makeenvelope(${x1}, ${y1}, ${x2}, ${y2}, 4326) as g)
    select f.fld_zone as zone, st_asgeojson(st_simplifypreservetopology(st_intersection(f.geom, env.g), 0.00005), 6) as geojson
    from flood_zone f, env
    where f.sfha and f.geom && env.g
    limit 500`;
  const fc: FeatureCollection<{ zone: string | null }> = {
    type: "FeatureCollection",
    features: rows.map((r) => ({ type: "Feature", geometry: JSON.parse(r.geojson), properties: { zone: r.zone } })),
  };
  return fc;
}

/** Grid size for the heat aggregate, in degrees (about 330 m north-south here). */
export const HEAT_CELL_DEG = 0.003;

export interface HeatCell {
  lon: number;
  lat: number;
  count: number;
}

/** GET /api/map/heat: event counts per grid cell in the org's area. Counts only, no addresses (spec 8). */
export async function heatGrid(sql: Sql, orgId: string, o: { kind: LayerKind; bbox?: Bbox | null; days?: number; category?: string | null }) {
  const days = Math.min(Math.max(o.days ?? 90, 1), 730);
  const b = o.bbox ?? null;
  const rows = await sql<HeatCell[]>`
    select st_x(cell) as lon, st_y(cell) as lat, n as count from (
      select st_snaptogrid(p.geom, ${HEAT_CELL_DEG}) as cell, count(*)::int as n
      from parcel_event e join parcel p on p.parcel_key = e.parcel_key
      where ${kindFilter(sql, o.kind)} and e.event_date >= current_date - ${days}::int and p.geom is not null
        and (${o.category ?? null}::text is null or e.category = ${o.category ?? null})
        and (${b === null} or p.geom && st_makeenvelope(${b?.[0] ?? 0}, ${b?.[1] ?? 0}, ${b?.[2] ?? 0}, ${b?.[3] ?? 0}, 4326))
        and p.parcel_key in (select org_territory_parcels(${orgId}))
      group by 1
    ) g
    order by n desc
    limit 5000`;
  return rows;
}

export const RING_RADIUS_M = 150;
export const RING_LIMIT = 40;

export interface RingHome {
  parcel_key: string;
  address: string;
  distance_m: number;
  lon: number;
  lat: number;
  lead_id: string | null;
  score: number | null;
  status: string | null;
  mailed_recently: boolean;
  opted_out: boolean;
}

export interface NeighborRing {
  center: { parcel_key: string; address: string; city: string; lon: number; lat: number; lead_id: string | null; status: string | null };
  radius_m: number;
  homes: RingHome[];
  counts: { homes: number; leads: number; mailed_recently: number; opted_out: number; mailable: number };
}

/**
 * GET /api/parcels/:key/neighbors: the nearest homes around a job (spec 9.3 neighbor-ring mode).
 * The center must be in the org's area; neighbors are residential homes in the area too, so the
 * ring never shows homes the org couldn't mail. Null when the center isn't the org's.
 */
export async function neighborRing(sql: Sql, orgId: string, parcelKey: string, o: { radiusM?: number; limit?: number } = {}): Promise<NeighborRing | null> {
  const radius = Math.min(Math.max(o.radiusM ?? RING_RADIUS_M, 25), 500);
  const limit = Math.min(Math.max(o.limit ?? RING_LIMIT, 1), 100);
  const [c] = await sql<NeighborRing["center"][]>`
    select p.parcel_key, p.addr_line as address, p.city, st_x(p.geom) as lon, st_y(p.geom) as lat, l.id as lead_id, l.status::text as status
    from parcel p left join lead l on l.org_id = ${orgId} and l.parcel_key = p.parcel_key
    where p.parcel_key = ${parcelKey} and p.geom is not null and org_parcel_in_territory(${orgId}, p.parcel_key)`;
  if (!c) return null;
  // st_expand (degrees) uses the gist index; the geography test is exact. 1 degree of latitude
  // is ~111 km and longitude shrinks with latitude, so 1/70,000 per metre covers both at 41-42 N.
  // The nearby homes are found first (a few hundred at most), then checked against the area.
  const homes = await sql<RingHome[]>`
    with c as (select geom from parcel where parcel_key = ${parcelKey}),
    near as materialized (
      select p.parcel_key, p.addr_line, p.addr_norm, p.geom,
        round(st_distance(p.geom::geography, c.geom::geography))::int as distance_m
      from c, parcel p
      where p.parcel_key <> ${parcelKey}
        and p.geom && st_expand(c.geom, ${radius / 70000})
        and st_dwithin(p.geom::geography, c.geom::geography, ${radius})
        and is_residential(p.land_use_code, p.data_limited))
    select n.parcel_key, n.addr_line as address, n.distance_m, st_x(n.geom) as lon, st_y(n.geom) as lat,
      l.id as lead_id, l.score, l.status::text as status,
      exists (select 1 from mail_piece m where m.org_id = ${orgId} and m.parcel_key = n.parcel_key and m.status <> 'canceled'
        and m.created_at > now() - make_interval(days => ${NO_REPEAT_DAYS})) as mailed_recently,
      exists (select 1 from suppression s where s.addr_norm = n.addr_norm or s.parcel_key = n.parcel_key) as opted_out
    from near n
      left join lead l on l.org_id = ${orgId} and l.parcel_key = n.parcel_key and not l.hidden
    where org_parcel_in_territory(${orgId}, n.parcel_key)
    order by n.distance_m, n.parcel_key
    limit ${limit}`;
  const mailedRecently = homes.filter((h) => h.mailed_recently).length;
  const optedOut = homes.filter((h) => h.opted_out).length;
  return {
    center: c,
    radius_m: radius,
    homes,
    counts: {
      homes: homes.length,
      leads: homes.filter((h) => h.lead_id).length,
      mailed_recently: mailedRecently,
      opted_out: optedOut,
      mailable: homes.filter((h) => !h.mailed_recently && !h.opted_out).length,
    },
  };
}

export interface Competitor {
  contractor_id: string;
  name: string;
  count: number;
  last_date: string;
  categories: { category: string; count: number }[];
  recent: { address: string; city: string; date: string; category: string | null }[];
}

export interface CompetitorReport {
  days: number;
  category: string | null;
  total_permits: number;
  /** Permits by contractors known only as a person: counted, never named (decision 32). */
  independent_permits: number;
  competitors: Competitor[];
}

/** GET /api/competitors: businesses pulling permits in the org's area (spec 8): name, count, categories, recent addresses. */
export async function competitors(sql: Sql, orgId: string, o: { days?: number; category?: string | null; limit?: number } = {}): Promise<CompetitorReport> {
  const days = Math.min(Math.max(o.days ?? 90, 7), 730);
  const cat = o.category ?? null;
  const limit = Math.min(Math.max(o.limit ?? 25, 1), 100);
  const permits = sql`
    select e.id, e.event_date, e.category, e.contractor_id, p.addr_line, p.city
    from parcel_event e join parcel p on p.parcel_key = e.parcel_key
    where e.kind = 'permit' and e.event_date >= current_date - ${days}::int
      and (${cat}::text is null or e.category = ${cat})
      and p.parcel_key in (select org_territory_parcels(${orgId}))`;
  const [t] = await sql<{ total: number; independent: number }[]>`
    with x as (${permits})
    select count(*)::int as total, count(*) filter (where c.is_individual)::int as independent
    from x left join contractor c on c.id = x.contractor_id`;
  const rows = await sql<Competitor[]>`
    with x as (${permits}),
    top as (
      select c.id, c.display_name, count(*)::int as n, max(x.event_date)::text as last_date
      from x join contractor c on c.id = x.contractor_id
      where not c.is_individual
      group by c.id, c.display_name
      order by n desc, c.display_name
      limit ${limit})
    select top.id::text as contractor_id, top.display_name as name, top.n as count, top.last_date,
      (select coalesce(json_agg(json_build_object('category', k.category, 'count', k.n) order by k.n desc, k.category), '[]'::json)
        from (select coalesce(category, 'other') as category, count(*)::int as n from x where x.contractor_id = top.id group by 1) k) as categories,
      (select coalesce(json_agg(json_build_object('address', r.addr_line, 'city', r.city, 'date', r.event_date::text, 'category', r.category)
          order by r.event_date desc, r.id desc), '[]'::json)
        from (select * from x where x.contractor_id = top.id order by x.event_date desc, x.id desc limit 5) r) as recent
    from top
    order by top.n desc, top.display_name`;
  return { days, category: cat, total_permits: t?.total ?? 0, independent_permits: t?.independent ?? 0, competitors: rows };
}
