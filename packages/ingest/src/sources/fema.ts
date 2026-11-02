// FEMA National Flood Hazard Layer, flood hazard zones (spec 5.5). Monthly full replace
// per county envelope, then each home gets the zone under its centroid.
import type { Sql } from "@216leads/db";
import { arcgisCount, arcgisPages, str } from "../arcgis";
import { withJobRun, type SourceDef } from "../runtime";

export const FEMA_LAYER = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";

/** WGS84 envelopes (xmin, ymin, xmax, ymax) for the counties we cover. */
export const COUNTY_ENVELOPES: Record<string, [number, number, number, number]> = {
  cuyahoga: [-81.97, 41.19, -81.39, 41.63],
  lake: [-81.49, 41.59, -80.99, 41.88],
  medina: [-82.18, 40.98, -81.68, 41.21],
  stark: [-81.65, 40.65, -81.08, 40.99],
  summit: [-81.69, 40.90, -81.39, 41.35],
};

type Ring = number[][];

const signedArea = (r: Ring) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! - r[i]![0]!) * (r[j]![1]! + r[i]![1]!);
  return a / 2; // < 0 means clockwise (y up)
};

const inRing = (pt: number[], r: Ring) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i] as [number, number];
    const [xj, yj] = r[j] as [number, number];
    if (yi > pt[1]! !== yj > pt[1]! && pt[0]! < ((xj - xi) * (pt[1]! - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Esri polygon rings -> WKT MULTIPOLYGON: clockwise rings are outers, counter-clockwise are holes. */
export function esriRingsToWkt(rings: Ring[]): string | null {
  const closed = rings.filter((r) => r.length >= 4);
  const outers = closed.filter((r) => signedArea(r) < 0).map((r) => ({ outer: r, holes: [] as Ring[] }));
  if (!outers.length) return null;
  for (const h of closed.filter((r) => signedArea(r) >= 0)) {
    const owner = outers.find((o) => inRing(h[0]!, o.outer));
    if (owner) owner.holes.push(h);
  }
  const ring = (r: Ring) => `(${r.map((p) => `${p[0]} ${p[1]}`).join(",")})`;
  return `MULTIPOLYGON(${outers.map((o) => `(${[o.outer, ...o.holes].map(ring).join(",")})`).join(",")})`;
}

export const femaSource: SourceDef = {
  code: "fema_flood",
  name: "FEMA NFHL flood hazard zones",
  url: FEMA_LAYER,
  schedule_cron: "0 1 1 * *",
};

export async function runFemaFlood(sql: Sql, counties: string[] = ["cuyahoga"]) {
  return withJobRun(sql, { job: "ingest", source: femaSource }, async (ctx) => {
    await sql`truncate flood_zone`;
    for (const county of counties) {
      const env = COUNTY_ENVELOPES[county];
      if (!env) continue;
      const extra = {
        geometry: env.join(","),
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        geometryPrecision: "6",
        maxAllowableOffset: "0.00003",
      };
      const expected = await arcgisCount(FEMA_LAYER, "1=1", extra);
      ctx.meta[`expected_${county}`] = expected;
      ctx.log(`${county}: ${expected} flood polygons`);
      for await (const page of arcgisPages(FEMA_LAYER, {
        where: "1=1", outFields: ["FLD_ZONE", "ZONE_SUBTY", "SFHA_TF"], returnGeometry: true, pageSize: 500, orderBy: "OBJECTID", extra,
      })) {
        const rows = page.features
          .filter((f) => f.geometry?.rings?.length)
          .map((f) => ({
            zone: str(f.attributes.FLD_ZONE),
            sub: str(f.attributes.ZONE_SUBTY),
            sfha: str(f.attributes.SFHA_TF) === "T",
            wkt: esriRingsToWkt(f.geometry!.rings!),
          }))
          .filter((r) => r.wkt !== null);
        ctx.rowsIn += rows.length;
        if (!rows.length) continue;
        const res = await sql`
          insert into flood_zone (fld_zone, zone_subty, sfha, geom)
          select zone, sub, sfha, g from (
            select zone, sub, sfha, st_multi(st_collectionextract(st_makevalid(st_geomfromtext(wkt, 4326)), 3)) as g
            from jsonb_to_recordset(${sql.json(rows as never)}) as x(zone text, sub text, sfha boolean, wkt text)
          ) y where g is not null and not st_isempty(g)`;
        ctx.rowsUpserted += res.count;
      }
    }
    // Zone under each home's centroid; SFHA wins where zones overlap.
    const upd = await sql`
      update parcel p set flood_zone = z.label, in_sfha = z.sfha, updated_at = now()
      from (
        select distinct on (p2.parcel_key) p2.parcel_key, f.sfha,
          f.fld_zone || case when f.zone_subty ilike '%0.2%' then ' 0.2%' else '' end as label
        from parcel p2 join flood_zone f on st_intersects(f.geom, p2.geom)
        where p2.geom is not null
        order by p2.parcel_key, f.sfha desc
      ) z
      where p.parcel_key = z.parcel_key and (p.flood_zone, p.in_sfha) is distinct from (z.label, z.sfha)`;
    ctx.meta.parcels_updated = upd.count;
    // Homes in a loaded county that no longer sit in any zone lose their old value.
    const cleared = await sql`
      update parcel p set flood_zone = null, in_sfha = null, updated_at = now()
      where p.county_code = any(${counties}) and p.flood_zone is not null and p.geom is not null
        and not exists (select 1 from flood_zone f where st_intersects(f.geom, p.geom))`;
    ctx.meta.parcels_cleared = cleared.count;
  });
}
