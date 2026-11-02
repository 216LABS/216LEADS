// Contractor name handling. Business names from public permits are shown; names that
// look like a private person are stored flagged and shown as "Independent contractor".

const ENTITY_WORDS = /\b(L\s?L\s?C|INC|INCORPORATED|CO|COMPANY|CORP|CORPORATION|LTD|LIMITED|LLP|PLLC|THE)\b/g;

const BUSINESS_HINTS =
  /\b(LLC|INC|CO|CORP|COMPANY|LTD|ROOF|ROOFING|HEAT|HEATING|COOL|PLUMB|PLUMBING|ELECTRIC|ELECTRICAL|EXTERIOR|EXTERIORS|CONSTRUCTION|CONSTRUCT|HOME|HOMES|BUILD|BUILDERS|BUILDING|CONTRACT|CONTRACTING|CONTRACTORS|SERVICE|SERVICES|SOLUTIONS|ENTERPRISES|GROUP|INDUSTRIES|MECHANICAL|HVAC|AIR|SUPPLY|DESIGN|REMODEL|REMODELING|RESTORATION|SIDING|WINDOWS|GUTTER|GUTTERS|WATERPROOFING|BASEMENT|CONCRETE|PAVING|FENCE|DECK|POOL|TREE|LANDSCAP\w*|LAWN|PAINT\w*|SOLAR|ENERGY|SYSTEMS|PROPERTIES|DEVELOPMENT|REALTY|MANAGEMENT|BROS|BROTHERS|SONS|ASSOCIATES|PARTNERS|AND)\b|&/;

export function contractorNameNorm(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,'"’()/\\-]/g, " ")
    .replace(ENTITY_WORDS, " ")
    .replace(/[^A-Z0-9& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a name looks like a private person ("JOHN Q SMITH", "SMITH, JOHN"). */
export function looksLikeIndividual(name: string): boolean {
  const upper = name.toUpperCase().trim();
  if (!upper) return false;
  if (BUSINESS_HINTS.test(upper)) return false;
  if (/\d/.test(upper)) return false;
  const words = upper.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z'-]+$/.test(w));
}

export const INDEPENDENT_CONTRACTOR = "Independent contractor";

export function contractorDisplay(c: { display_name: string; is_individual: boolean } | null | undefined): string | null {
  if (!c) return null;
  return c.is_individual ? INDEPENDENT_CONTRACTOR : c.display_name;
}
