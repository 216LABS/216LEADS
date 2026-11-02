// Cuyahoga tax districts look like "Cleveland/Shaker Hts" or "GARFIELD HTS/ CLEVE":
// the part before the slash is the municipality, the rest is the school district.

const FIXES: [RegExp, string][] = [
  [/\bHTS\b\.?/g, "HEIGHTS"],
  [/^CLEVE HEIGHTS$/, "CLEVELAND HEIGHTS"],
  [/^S EUCLID$/, "SOUTH EUCLID"],
  [/^N OLMSTED$/, "NORTH OLMSTED"],
  [/^N ROYALTON$/, "NORTH ROYALTON"],
  [/^BEFORD HEIGHTS$/, "BEDFORD HEIGHTS"],
  [/^CHAGRIN FALLS TOWNSH?I?P?$/, "CHAGRIN FALLS TOWNSHIP"],
  [/^CHAGRIN FALLS TWP$/, "CHAGRIN FALLS TOWNSHIP"],
  [/^CHAGRIN FALLS VILLAG?E?$/, "CHAGRIN FALLS"],
  [/^HIGHLAND HILLS VILLA(GE)?$/, "HIGHLAND HILLS"],
];

export function municipalityFromTaxDistrict(desc: string | null | undefined, postalCity: string | null | undefined): string {
  const raw = (desc ?? "").split("/")[0]!.toUpperCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  let name = raw || (postalCity ?? "").toUpperCase().trim();
  for (const [re, to] of FIXES) name = name.replace(re, to).replace(/\s+/g, " ").trim();
  return name || "UNKNOWN";
}
