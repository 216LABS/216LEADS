// City of Cleveland open data (spec 5.6). Cleveland uses the same 8-digit parcel number as
// the county, so matching is by parcel id first.
import type { Sql } from "@216leads/db";
import { addDays, epochToEtDate, looksLikeIndividual, todayEt, zip5 } from "@216leads/shared";
import { categorize } from "@216leads/scoring";
import { arcgisCount, arcgisPages, dropFields, int, layerInfo, num, str, truthy } from "../arcgis";
import { rawStore } from "../rawstore";
import { setSourceNotes, withJobRun, type SourceDef } from "../runtime";
import { writeEvents, resolveContractors, type EventInput, type EventKind } from "../events";

export const CLE_BASE = "https://services3.arcgis.com/dty2kHktVXHrqO8i/ArcGIS/rest/services";
const layer = (service: string) => `${CLE_BASE}/${service}/FeatureServer/0`;

type Attrs = Record<string, unknown>;

interface CleLayer {
  code: string;
  service: string;
  name: string;
  kind: EventKind;
  keyField: string;
  idField: string;
  /** Date field; null = pick the first date field from the layer on first run and log it. */
  dateField: string | null;
  fallbackDateField?: string;
  /** Fields requested. Never includes owner/person fields. */
  outFields: string[];
  /** Removed before anything is persisted (defense in depth; they are not requested). */
  drop: string[];
  map: (a: Attrs) => Partial<EventInput>;
}

/** "16315 LOTUS DR, CLEVELAND, OH, 44128" -> line + zip */
function splitAddress(full: unknown): { line: string | null; zip: string | null } {
  const s = str(full);
  if (!s) return { line: null, zip: null };
  const parts = s.split(",").map((p) => p.trim());
  const zip = parts.map((p) => p.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1]).filter(Boolean).pop() ?? null;
  return { line: parts[0] ?? null, zip };
}

const PERSON_DROP = [
  "CONTRACTOR_NAME", "Owner_Name", "Owner_Org_Name", "Owner_Address", "Local_Agent_In_Charge_*", "Property_Management_*",
  "OWNER_NAME", "BUYER_NAME", "BUYER_BUSINESS_NAME", "TITLE_AGENCY_NAME", "TITLE_AGENCY_BUSINESS_NAME",
  "MORTGAGE_BROKER_NAME", "MORTGAGE_BROKER_BUSINESS_NAME", "MORTGAGE_COMPANY", "MORTGAGE_COMPANY_BUSINESS_NAME",
  "owner", "mailadd", "careof", "mail_*", "deeded_own", "grantor", "grantee", "Inspector",
];

export const CLE_LAYERS: CleLayer[] = [
  {
    code: "cle_permits", service: "Building_Permits", name: "Cleveland building permits", kind: "permit",
    keyField: "PARCEL_NUMBER", idField: "PERMIT_ID", dateField: "ISSUE_DATE",
    outFields: ["DW_Parcel", "PERMIT_ID", "PRIMARY_ADDRESS", "PERMIT_TYPE", "PERMIT_SUBTYPE", "PERMIT_CATEGORY", "JOB_DESCRIPTION",
      "WORK_DESCRIPTION", "CONTRATOR_BUSINESS_NAME", "CONTRATOR_LICENSE_ID", "JOB_VALUE", "ISSUE_DATE",
      "CURRENT_TASK_STATUS", "PARCEL_NUMBER", "ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => {
      const raw_type = [str(a.PERMIT_CATEGORY), str(a.PERMIT_TYPE), str(a.PERMIT_SUBTYPE)].filter(Boolean).join(" / ");
      const description = str(a.WORK_DESCRIPTION) ?? str(a.JOB_DESCRIPTION);
      const business = str(a.CONTRATOR_BUSINESS_NAME);
      const license = str(a.CONTRATOR_LICENSE_ID);
      return {
        raw_type, description, amount: int(a.JOB_VALUE), status: str(a.CURRENT_TASK_STATUS),
        category: categorize(raw_type, description),
        // CONTRACTOR_NAME (the license holder, sometimes the homeowner) is never requested;
        // without a business name the contractor is kept only by license number.
        contractor: business
          ? { name: business, is_individual: looksLikeIndividual(business), license_id: license }
          : license ? { name: "", is_individual: true, license_id: license } : null,
      };
    },
  },
  {
    code: "cle_violations", service: "Complaint_Violation_Notices", name: "Cleveland code violation notices", kind: "violation",
    keyField: "PARCEL_NUMBER", idField: "V_PERMIT_ID", dateField: "ISSUE_DATE", fallbackDateField: "FILE_DATE",
    outFields: ["DW_Parcel", "V_PERMIT_ID", "FILE_DATE", "ISSUE_DATE", "RECORD_STATUS", "ACTIVE_VIOLATION", "ADDRESS", "PARCEL_NUMBER",
      "TYPE_OF_VIOLATION", "VIOLATION_CITATIONS", "ADDITIONAL_CITATION_DETAILS", "ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => {
      const raw_type = str(a.TYPE_OF_VIOLATION);
      const description = [str(a.VIOLATION_CITATIONS), str(a.ADDITIONAL_CITATION_DETAILS)].filter(Boolean).join(" ");
      return { raw_type, description, status: str(a.RECORD_STATUS), is_active: truthy(a.ACTIVE_VIOLATION), category: categorize(raw_type, description) };
    },
  },
  {
    code: "cle_rentals", service: "Rental_Registrations", name: "Cleveland rental registrations", kind: "rental_registration",
    keyField: "Parcel", idField: "Record_ID", dateField: "File_Date",
    outFields: ["DW_Parcel", "Record_ID", "File_Date", "Address_Full", "Parcel", "Units", "Record_Status", "Active_Registration_Current_Year",
      "ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => ({ raw_type: "Rental registration", status: str(a.Record_Status), is_active: truthy(a.Active_Registration_Current_Year), description: str(a.Units) ? `${str(a.Units)} units` : null }),
  },
  {
    code: "cle_condemnations", service: "Current_Condemnations", name: "Cleveland condemnations", kind: "condemnation",
    keyField: "Parcel_Number", idField: "OBJECTID", dateField: "Condemnation_Date",
    outFields: ["DW_Parcel", "OBJECTID", "Parcel_Number", "Active_Condemnation", "Address", "Condemnation_Date", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => ({ raw_type: "Condemnation", is_active: truthy(a.Active_Condemnation) }),
  },
  {
    code: "cle_demo", service: "Demolition_Permits", name: "Cleveland demolition permits", kind: "demolition",
    keyField: "PRIMARY_PARCEL", idField: "PERMIT_ID", dateField: null, fallbackDateField: "FILE_DATE",
    outFields: ["DW_Parcel", "PERMIT_ID", "PERMIT_TYPE", "PERMIT_SUBTYPE", "PRIMARY_ADDRESS", "PRIMARY_PARCEL", "FILE_DATE", "ISSUED_DATE",
      "CLOSED_DATE", "Contrator_Business_Name", "Job_Value", "ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => {
      const business = str(a.Contrator_Business_Name);
      return {
        raw_type: [str(a.PERMIT_TYPE), str(a.PERMIT_SUBTYPE)].filter(Boolean).join(" / "), amount: int(a.Job_Value), category: "demolition",
        contractor: business ? { name: business, is_individual: looksLikeIndividual(business) } : null,
      };
    },
  },
  {
    code: "cle_boardup", service: "Boardup_Permits", name: "Cleveland board-up permits", kind: "boardup",
    keyField: "PARCEL_NUMBER", idField: "PERMIT_ID", dateField: null, fallbackDateField: "FILE_DATE",
    outFields: ["DW_Parcel", "PERMIT_ID", "PERMIT_TYPE", "PERMIT_SUBTYPE", "PERMIT_CATEGORY", "PRIMARY_ADDRESS", "PARCEL_NUMBER", "FILE_DATE",
      "ISSUE_DATE", "ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => ({ raw_type: [str(a.PERMIT_CATEGORY), str(a.PERMIT_TYPE)].filter(Boolean).join(" / ") }),
  },
  {
    code: "cle_coo", service: "Certificates_of_Occupancy", name: "Cleveland certificates of occupancy", kind: "certificate_of_occupancy",
    keyField: "Parcel", idField: "PermitNumber", dateField: null,
    outFields: ["DW_Parcel", "PermitNumber", "SubType", "ApplicationCategory", "ApplicationStatus", "FileDate", "address", "Parcel",
      "CERTIFICATE_ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => ({ raw_type: [str(a.ApplicationCategory), str(a.SubType)].filter(Boolean).join(" / "), status: str(a.ApplicationStatus), source_url: str(a.CERTIFICATE_ACCELA_CITIZEN_ACCESS_URL) }),
  },
  {
    code: "cle_leadsafe", service: "Lead_Safe_Certificates", name: "Cleveland lead safe certificates", kind: "lead_safe",
    keyField: "PARCEL_NUMBER", idField: "RECORD_ID", dateField: null,
    outFields: ["DW_Parcel", "RECORD_ID", "RECORD_FILE_DATE", "STATUS", "IS_ACTIVE", "EXPIRATION_DATE", "PrimaryAddress", "PrimaryAddressZip",
      "PARCEL_NUMBER", "INSPECTION_TYPE", "ACCELA_CITIZEN_ACCESS_URL"],
    drop: PERSON_DROP,
    map: (a) => ({ raw_type: "Lead safe certificate", status: str(a.STATUS), is_active: truthy(a.IS_ACTIVE), category: "painting", description: str(a.INSPECTION_TYPE) }),
  },
  {
    code: "cle_disclosure", service: "Certificates_of_Disclosure", name: "Cleveland certificates of disclosure", kind: "disclosure",
    keyField: "PRIMARY_PARCEL", idField: "PERMIT_ID", dateField: null,
    outFields: ["DW_Parcel", "PERMIT_ID", "FILE_DATE", "PRIMARY_PARCEL", "PRIMARY_ADDRESS", "ISSUE_DATE", "CONDEMNED_STATUS", "CURRENT_VIOLATIONS",
      "ACCELA_CITIZEN_ACCESS_URL", "LON", "LAT"],
    drop: PERSON_DROP,
    map: (a) => ({ raw_type: "Certificate of disclosure", description: str(a.CURRENT_VIOLATIONS) ? `Current violations: ${str(a.CURRENT_VIOLATIONS)}` : null }),
  },
];

const ADDRESS_FIELDS = ["PRIMARY_ADDRESS", "ADDRESS", "Address", "Address_Full", "address", "PrimaryAddress"];
const URL_FIELDS = ["ACCELA_CITIZEN_ACCESS_URL"];

export function cleSource(l: CleLayer): SourceDef {
  return { code: l.code, name: l.name, url: layer(l.service), schedule_cron: "0 5 * * *" };
}

export function eventFromCle(l: CleLayer, a: Attrs, dateField: string): EventInput | null {
  const id = str(a[l.idField]);
  const date = epochToEtDate(num(a[dateField])) ?? (l.fallbackDateField ? epochToEtDate(num(a[l.fallbackDateField])) : null);
  if (!id || !date) return null;
  const addrRaw = ADDRESS_FIELDS.map((f) => a[f]).find((v) => str(v));
  const { line, zip } = splitAddress(addrRaw);
  const zipField = str(a.PrimaryAddressZip);
  const mapped = l.map(a);
  return {
    source: l.code,
    source_record_id: id,
    kind: l.kind,
    event_date: date,
    source_url: URL_FIELDS.map((f) => str(a[f])).find(Boolean) ?? null,
    lon: num(a.LON),
    lat: num(a.LAT),
    ...mapped,
    match: {
      county: "cuyahoga",
      parcelId: str(a[l.keyField]),
      altParcelIds: [str(a.DW_Parcel)],
      addrLine: line,
      zip: zip5(zipField ?? zip),
      lon: num(a.LON),
      lat: num(a.LAT),
    },
    payload: dropFields(a, l.drop),
  };
}

export interface CleOpts {
  full?: boolean;
  /** Only ingest records on/after this date (fixtures and quick loads). */
  since?: string;
  /** Restrict to parcels in these zips via a parcel-number list (fixtures). */
  parcelIds?: string[];
  limit?: number;
}

export async function runCleLayer(sql: Sql, l: CleLayer, o: CleOpts = {}) {
  const src = cleSource(l);
  return withJobRun(sql, { job: "ingest", source: src }, async (ctx) => {
    let dateField = l.dateField ?? (ctx.cursor.date_field as string | undefined) ?? null;
    if (!dateField) {
      const info = await layerInfo(layer(l.service));
      const dates = info.fields.filter((f) => f.type === "Date").map((f) => f.name);
      dateField = dates.find((n) => /ISSUE/i.test(n)) ?? dates.find((n) => /FILE/i.test(n)) ?? dates[0] ?? null;
      if (!dateField) throw new Error(`${l.service}: no date field found`);
      ctx.cursor.date_field = dateField;
      await setSourceNotes(sql, l.code, `Date field picked on first run: ${dateField} (of ${dates.join(", ")})`);
      ctx.log(`picked date field ${dateField}`);
    }
    const maxSeen = ctx.cursor.max_seen as string | undefined;
    const parts: string[] = [];
    if (o.since) parts.push(`${dateField} >= DATE '${o.since}'`);
    else if (!o.full && maxSeen) parts.push(`${dateField} >= DATE '${addDays(maxSeen, -7)}'`); // Cleveland backfills late
    const baseWhere = parts.length ? parts.join(" AND ") : "1=1";
    const wheres: string[] = [];
    if (o.parcelIds?.length) {
      for (let i = 0; i < o.parcelIds.length; i += 300) {
        wheres.push(`(${baseWhere}) AND ${l.keyField} IN (${o.parcelIds.slice(i, i + 300).map((p) => `'${p}'`).join(",")})`);
      }
    } else wheres.push(baseWhere);
    ctx.meta.mode = parts.length ? "delta" : "full";
    ctx.meta.date_field = dateField;
    if (!o.parcelIds) {
      ctx.meta.expected = await arcgisCount(layer(l.service), baseWhere);
      ctx.log(`${ctx.meta.mode} load, expecting ${ctx.meta.expected} rows`);
    }

    let newest = maxSeen ?? "";
    let n = 0;
    let fetched = 0;
    for (const where of wheres) {
      for await (const page of arcgisPages(layer(l.service), { where, outFields: l.outFields, pageSize: 1000, orderBy: "OBJECTID" })) {
        const attrs = page.features.map((f) => dropFields(f.attributes, l.drop));
        const ref = rawStore().put(l.code, `${page.offset}-${where.length}`, attrs);
        fetched += attrs.length;
        const events = attrs.map((a) => eventFromCle(l, a, dateField!)).filter((e): e is EventInput => e !== null);
        // Records without an id or any date are skipped and counted, never given an invented date.
        ctx.meta.skipped_no_date = Number(ctx.meta.skipped_no_date ?? 0) + (attrs.length - events.length);
        const take = o.limit ? events.slice(0, Math.max(0, o.limit - n)) : events;
        for (const e of take) {
          e.raw_ref = ref;
          if (e.event_date > newest && e.event_date <= todayEt()) newest = e.event_date;
        }
        ctx.rowsIn += take.length;
        const r = await writeEvents(sql, take);
        ctx.rowsUpserted += r.upserted;
        ctx.rowsUnmatched += r.unmatched;
        n += take.length;
        if (page.offset % 20000 === 0 && page.offset > 0) ctx.log(`${n} rows`);
        if (o.limit && n >= o.limit) break;
      }
      if (o.limit && n >= o.limit) break;
    }
    if (newest && !o.parcelIds && !o.limit) ctx.cursor.max_seen = newest;
    const exp = Number(ctx.meta.expected ?? 0);
    ctx.meta.fetched = fetched;
    if (exp && !o.limit && fetched < exp * 0.98) ctx.status = "partial";
    await markClevelandCoverage(sql, l.code);
  });
}

/** Keep parcel flags and per-town coverage in step with what Cleveland publishes. */
export async function markClevelandCoverage(sql: Sql, code: string) {
  const cle = () => sql`(select id from municipality where county_code = 'cuyahoga' and name = 'CLEVELAND')`;
  if (code === "cle_permits") {
    await sql`update municipality set permits_source = 'cle_permits', data_tier = 'open_api',
      permits_since = coalesce((select extract(year from min(event_date))::int from parcel_event where source = 'cle_permits'), 2015)
      where id in ${cle()}`;
  }
  if (code === "cle_violations") await sql`update municipality set has_violations = true where id in ${cle()}`;
  if (code === "cle_rentals") {
    await sql`
      update parcel p set is_rental = x.active, updated_at = now()
      from (
        select p2.parcel_key, coalesce(bool_or(e.is_active), false) as active
        from parcel p2 left join parcel_event e on e.parcel_key = p2.parcel_key and e.kind = 'rental_registration'
        where p2.municipality_id in ${cle()} or e.parcel_key is not null
        group by p2.parcel_key
      ) x
      where p.parcel_key = x.parcel_key and p.is_rental is distinct from x.active`;
  }
}

// ---------------------------------------------------------------------------
// 2022 citywide property survey -> parcel.survey_2022 (one-time)

export const cleSurveySource: SourceDef = {
  code: "cle_survey", name: "Cleveland 2022 citywide property survey", url: layer("Citywide_Property_Survey_2022"),
  schedule_cron: "@once", notes: "One-time load. Reasons are labeled '2022 city survey'.",
};

const SURVEY_FIELDS: Record<string, string> = {
  roof: "survey_condition_roof", gutters: "survey_condition_gutters", siding: "survey_condition_siding",
  windows: "survey_condition_windows", porch: "survey_condition_porch", chimney: "survey_condition_chimney",
  driveway: "survey_condition_driveway", garage: "survey_condition_garage", paint_peeling: "survey_paintpeeling",
  grade: "survey_grade",
};

export async function runCleSurvey(sql: Sql, o: { parcelIds?: string[] } = {}) {
  return withJobRun(sql, { job: "ingest", source: cleSurveySource }, async (ctx) => {
    const outFields = ["parcelnumb_no_formatting", "survey_created", ...Object.values(SURVEY_FIELDS)];
    const wheres: string[] = [];
    if (o.parcelIds?.length) {
      for (let i = 0; i < o.parcelIds.length; i += 300) {
        wheres.push(`parcelnumb_no_formatting IN (${o.parcelIds.slice(i, i + 300).map((p) => `'${p}'`).join(",")})`);
      }
    } else wheres.push("1=1");
    for (const where of wheres) {
      for await (const page of arcgisPages(layer("Citywide_Property_Survey_2022"), { where, outFields, pageSize: 2000, orderBy: "OBJECTID" })) {
        const rows = page.features.map((f) => f.attributes).flatMap((a) => {
          const pin = str(a.parcelnumb_no_formatting);
          if (!pin) return [];
          const survey: Record<string, string | null> = {};
          for (const [k, f] of Object.entries(SURVEY_FIELDS)) survey[k] = str(a[f]);
          survey.surveyed = str(a.survey_created);
          return [{ parcel_key: `cuyahoga:${pin.toUpperCase().padStart(8, "0")}`, survey }];
        });
        ctx.rowsIn += rows.length;
        if (!rows.length) continue;
        const res = await sql`
          update parcel p set survey_2022 = x.survey, updated_at = now()
          from jsonb_to_recordset(${sql.json(rows as never)}) as x(parcel_key text, survey jsonb)
          where p.parcel_key = x.parcel_key and p.survey_2022 is distinct from x.survey`;
        ctx.rowsUpserted += res.count;
        if (page.offset % 40000 === 0) ctx.log(`${ctx.rowsIn} survey rows`);
      }
    }
    await sql`update municipality set has_survey = true where county_code = 'cuyahoga' and name = 'CLEVELAND'`;
  });
}

// ---------------------------------------------------------------------------
// Active contractor registry -> contractor + alias seed

export const cleContractorsSource: SourceDef = {
  code: "cle_contractors", name: "Cleveland active contractor registrations", url: layer("Active_Contractor_Registrations"),
  schedule_cron: "0 5 * * 1",
};

export async function runCleContractors(sql: Sql) {
  return withJobRun(sql, { job: "ingest", source: cleContractorsSource }, async (ctx) => {
    for await (const page of arcgisPages(layer("Active_Contractor_Registrations"), {
      where: "1=1", outFields: ["B1_ALT_ID", "BUSINESS_NAME", "CONTRACTOR_LICENSE_TYPE", "B1_PHONE1"], pageSize: 1000, orderBy: "ObjectId",
    })) {
      const inputs = page.features.map((f) => f.attributes).filter((a) => str(a.BUSINESS_NAME)).map((a) => ({
        name: str(a.BUSINESS_NAME)!,
        is_individual: looksLikeIndividual(str(a.BUSINESS_NAME)!),
        license_id: str(a.B1_ALT_ID),
        phone: str(a.B1_PHONE1),
      }));
      ctx.rowsIn += inputs.length;
      const ids = await resolveContractors(sql, inputs);
      ctx.rowsUpserted += ids.filter(Boolean).length;
    }
  });
}

export function cleLayer(code: string): CleLayer {
  const l = CLE_LAYERS.find((x) => x.code === code);
  if (!l) throw new Error(`unknown Cleveland layer ${code}`);
  return l;
}

