// Evidence links: public record pages for the facts behind each reason. Field lists are
// explicit so owner columns are never shown.
const CUY_PARCELS = "https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer/1";
const CCPC = "https://gis.cuyahogacounty.gov/server/rest/services/CCPC/UTC2019_Metrics_Final/MapServer/0";
const CLE_SURVEY = "https://services3.arcgis.com/dty2kHktVXHrqO8i/ArcGIS/rest/services/Citywide_Property_Survey_2022/FeatureServer/0";
const FEMA = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";
const LAKE = "https://gis.lakecountyohio.gov/arcgis/rest/services/GIS/GIS_Parcels_WGS84/FeatureServer/0";

const q = (where: string) => encodeURIComponent(where);

export function parcelRecordUrl(county: string, parcelId: string): string | null {
  if (county === "cuyahoga") {
    const f = "parcel_id,par_addr_all,max_age,res_styles,total_res_liv_area,parcel_acreage,last_transfer_date,last_sales_amount,gas,water,sewer,tax_market_total";
    return `${CUY_PARCELS}/query?where=${q(`parcel_id='${parcelId}'`)}&outFields=${f}&returnGeometry=false&f=html`;
  }
  if (county === "lake") {
    const f = "PIN_NODASH,A_HOUSENO,A_ST_NAME,A_USPS_CITY,A_YEAR_BUILT,A_ACRES,A_VAL_TOTAL,A_SALE_DATE,A_SALE_AMOUNT";
    return `${LAKE}/query?where=${q(`PIN_NODASH='${parcelId}'`)}&outFields=${f}&returnGeometry=false&f=html`;
  }
  return null;
}

export function canopyUrl(county: string, parcelId: string): string | null {
  if (county !== "cuyahoga") return null;
  return `${CCPC}/query?where=${q(`PARCELPIN='${parcelId}'`)}&outFields=PARCELPIN,Can_P,Grass_P,Imperv_P&returnGeometry=false&f=html`;
}

export function surveyUrl(county: string, parcelId: string): string | null {
  if (county !== "cuyahoga") return null;
  const f = "parcelnumb_no_formatting,survey_created,survey_grade,survey_condition_roof,survey_condition_gutters,survey_condition_siding,survey_condition_windows,survey_condition_porch,survey_condition_chimney,survey_condition_driveway,survey_condition_garage,survey_paintpeeling";
  return `${CLE_SURVEY}/query?where=${q(`parcelnumb_no_formatting='${parcelId}'`)}&outFields=${f}&returnGeometry=false&f=html`;
}

export function floodUrl(lon: number | null, lat: number | null): string | null {
  if (lon == null || lat == null) return null;
  return `${FEMA}/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=html`;
}
