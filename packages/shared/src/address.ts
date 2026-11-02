// Address normalization (BUILD_SPEC section 6).
// addr_norm = house_no + ' ' + predir + ' ' + street + ' ' + suffix + '|' + zip5

/** USPS Publication 28 street suffixes: every spelling maps to the standard abbreviation. */
const SUFFIXES: Record<string, string> = {
  AVENUE: "AVE", AVE: "AVE", AV: "AVE", AVN: "AVE", AVNUE: "AVE",
  STREET: "ST", ST: "ST", STR: "ST", STRT: "ST",
  ROAD: "RD", RD: "RD",
  DRIVE: "DR", DR: "DR", DRV: "DR",
  BOULEVARD: "BLVD", BLVD: "BLVD", BOUL: "BLVD", BLV: "BLVD",
  COURT: "CT", CT: "CT", CRT: "CT",
  LANE: "LN", LN: "LN",
  PLACE: "PL", PL: "PL",
  PARKWAY: "PKWY", PKWY: "PKWY", PKY: "PKWY", PARKWY: "PKWY",
  TERRACE: "TER", TER: "TER", TERR: "TER",
  CIRCLE: "CIR", CIR: "CIR", CIRC: "CIR",
  TRAIL: "TRL", TRL: "TRL",
  WAY: "WAY", WY: "WAY",
  HIGHWAY: "HWY", HWY: "HWY",
  SQUARE: "SQ", SQ: "SQ",
  OVAL: "OVAL", OVL: "OVAL",
  PIKE: "PIKE", PIKES: "PIKE",
  ROW: "ROW", RUN: "RUN", PATH: "PATH", WALK: "WALK", LOOP: "LOOP", PASS: "PASS",
  POINT: "PT", PT: "PT",
  CROSSING: "XING", XING: "XING",
  COVE: "CV", CV: "CV",
  GLEN: "GLN", GLN: "GLN",
  RIDGE: "RDG", RDG: "RDG",
  HILL: "HL", HL: "HL", HILLS: "HLS", HLS: "HLS",
  HEIGHTS: "HTS", HTS: "HTS",
  TURNPIKE: "TPKE", TPKE: "TPKE",
  EXTENSION: "EXT", EXT: "EXT",
  CREEK: "CRK", CRK: "CRK",
  ESTATES: "EST", ESTATE: "EST",
  VIEW: "VW", VW: "VW",
  VILLAGE: "VLG", VLG: "VLG",
  WOODS: "WDS", WDS: "WDS",
  LANDING: "LNDG", LNDG: "LNDG",
  MEADOWS: "MDWS", MDWS: "MDWS",
  CENTER: "CTR", CTR: "CTR",
  GROVE: "GRV", GRV: "GRV",
  PARK: "PARK", PRK: "PARK",
  TRACE: "TRCE", TRCE: "TRCE",
  CLOSE: "CLOSE", COMMONS: "CMNS", CMNS: "CMNS",
};

const DIRECTIONS: Record<string, string> = {
  N: "N", S: "S", E: "E", W: "W", NE: "NE", NW: "NW", SE: "SE", SW: "SW",
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
};

/** Street-name word aliases (applied inside the street name, never to the suffix). */
const NAME_ALIASES: Record<string, string> = { MT: "MOUNT", MNT: "MOUNT", FT: "FORT", SAINT: "ST" };

/** Unit designators that take a value ("APT 2") and ones that stand alone ("REAR"). */
const UNIT_WITH_VALUE = new Set(["APT", "UNIT", "STE", "SUITE", "FL", "FLOOR", "RM", "ROOM", "BLDG", "LOT", "#"]);
const UNIT_ALONE = new Set(["REAR", "UP", "DN", "UPPER", "LOWER", "DOWN", "UPSTAIRS", "DOWNSTAIRS", "FRONT", "BSMT"]);

export interface NormalizedAddress {
  houseNo: string;
  predir: string;
  street: string;
  suffix: string;
  unit: string;
  zip5: string;
  /** Display line without unit, e.g. "1234 W 117TH ST". */
  line: string;
  /** Matching key, e.g. "1234 W 117TH ST|44111". */
  addrNorm: string;
}

/** Left-pad a 5-digit zip given as number or string; zip+4 keeps the first 5. */
export function zip5(z: string | number | null | undefined): string {
  if (z === null || z === undefined) return "";
  const digits = String(z).trim().match(/^\d+/)?.[0] ?? "";
  if (!digits) return "";
  if (digits.length > 5) return digits.slice(0, 5);
  return digits.padStart(5, "0");
}

function tokenize(line: string): string[] {
  return line
    .toUpperCase()
    .replace(/#\s*(\w+)/g, " # $1") // "#2" -> "# 2"
    .replace(/[.,;:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function normalizeAddress(line: string, zip?: string | number | null): NormalizedAddress {
  let tokens = tokenize(line);
  const unitParts: string[] = [];

  // Pull unit designators out wherever they appear after the house number.
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (i > 0 && UNIT_WITH_VALUE.has(t)) {
      const v = tokens[i + 1];
      unitParts.push(v ? `${t} ${v}` : t);
      i++;
      continue;
    }
    if (i > 0 && UNIT_ALONE.has(t)) {
      unitParts.push(t);
      continue;
    }
    kept.push(t);
  }
  tokens = kept;

  // House number: first token if it starts with a digit. Ranges keep the first number.
  let houseNo = "";
  if (tokens.length && /^\d/.test(tokens[0]!)) {
    const first = tokens.shift()!;
    houseNo = first.split("-")[0]!.replace(/[^0-9A-Z]/g, "");
    // "1234 1/2" fractional house numbers stay with the number.
    if (tokens[0] && /^\d+\/\d+$/.test(tokens[0])) houseNo += ` ${tokens.shift()}`;
  }

  // Pre-direction: only when what follows is more than a lone suffix ("WEST BLVD" is a street name).
  let predir = "";
  if (tokens.length >= 2 && DIRECTIONS[tokens[0]!]) {
    const rest = tokens.slice(1);
    const loneSuffix = rest.length === 1 && SUFFIXES[rest[0]!] !== undefined;
    if (!loneSuffix) predir = DIRECTIONS[tokens.shift()!]!;
  }

  // Post-direction after the suffix ("MAIN ST N"): fold into the suffix slot.
  let postdir = "";
  if (tokens.length >= 3 && DIRECTIONS[tokens[tokens.length - 1]!] && SUFFIXES[tokens[tokens.length - 2]!]) {
    postdir = DIRECTIONS[tokens.pop()!]!;
  }

  // Suffix: last token when it is a known suffix and something remains for the name.
  let suffix = "";
  if (tokens.length >= 2 && SUFFIXES[tokens[tokens.length - 1]!]) {
    suffix = SUFFIXES[tokens.pop()!]!;
  }
  if (postdir) suffix = suffix ? `${suffix} ${postdir}` : postdir;

  const street = tokens.map((t) => NAME_ALIASES[t] ?? t).join(" ");
  const z = zip5(zip);
  const lineOut = [houseNo, predir, street, suffix].filter(Boolean).join(" ");
  return {
    houseNo,
    predir,
    street,
    suffix,
    unit: unitParts.join(" "),
    zip5: z,
    line: lineOut,
    addrNorm: `${lineOut}|${z}`,
  };
}

/** Build addr_norm from already-split county fields. */
export function addrNormFromParts(parts: {
  houseNo?: string | number | null;
  predir?: string | null;
  street?: string | null;
  suffix?: string | null;
  zip?: string | number | null;
}): NormalizedAddress {
  const line = [parts.houseNo, parts.predir, parts.street, parts.suffix]
    .filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
    .join(" ");
  return normalizeAddress(line, parts.zip);
}

/** Mask a house number for public samples: "1234 W 117TH ST" -> "12xx W 117th St". */
export function maskAddress(line: string): string {
  const m = line.match(/^(\d+)(.*)$/);
  if (!m) return titleCase(line);
  const num = m[1]!;
  const keep = Math.max(1, num.length - 2);
  return `${num.slice(0, keep)}${"x".repeat(num.length - keep)}${titleCase(m[2]!)}`;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_m, n: string, o: string) => n + o.toLowerCase())
    .replace(/\b(Ne|Nw|Se|Sw)\b/g, (d) => d.toUpperCase());
}
