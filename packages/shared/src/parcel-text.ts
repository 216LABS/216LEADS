// Plain words for parcel codes shown on lead detail (issue #74).

/** Cuyahoga `res_styles` codes we can name with confidence. Others are hidden, not shown as letters. */
const STYLES: Record<string, string> = {
  COL: "Colonial", CAP: "Cape Cod", RAN: "Ranch", SPL: "Split level", BUN: "Bungalow", BIL: "Bi-level", TWN: "Townhouse",
};

/** "COL" -> "Colonial", "CAP, COL" -> "Cape Cod, Colonial", "COL, COL" -> "Colonial"; null when no code is known. */
export function homeStyle(codes: string | null | undefined): string | null {
  if (!codes) return null;
  const names = [...new Set(codes.split(",").map((c) => STYLES[c.trim().toUpperCase()]).filter((n): n is string => !!n))];
  return names.length ? names.join(", ") : null;
}

/** FEMA flood zone in words, keeping the code: "Minimal risk (zone X)", "High risk (zone AE)". */
export function floodZoneText(zone: string | null | undefined, inSfha: boolean | null | undefined): string | null {
  if (!zone) return null;
  const z = zone.trim().toUpperCase();
  if (inSfha || /^(A|V)/.test(z)) return `High risk (zone ${z})`;
  if (/^X/.test(z) && /0\.2|500/.test(z)) return "Moderate risk (zone X, 0.2% chance a year)";
  if (z === "X" || z === "C") return `Minimal risk (zone ${z})`;
  if (z === "D") return "Not yet studied (zone D)";
  return `Zone ${z}`;
}

/** "1 home", "2,000 homes", "1 address" (issue #77: counts read "1 homes"). */
export function countOf(n: number, singular: string, plural = /(s|x|ch|sh)$/.test(singular) ? `${singular}es` : `${singular}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}
