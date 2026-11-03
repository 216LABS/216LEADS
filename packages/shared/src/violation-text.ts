// Readable findings from a Cleveland violation description (Fix list). The city's text is the
// inspector's form: guidesheet instructions, ordinance numbers in brackets, legal notices, all caps.

/** Form instructions that sometimes lead the description. */
const PREAMBLE = /^\s*use this guidesheet\b.*?(?:violation description\.|description\.)\s*/i;

/** Notices on every citation, not something the home needs. */
const BOILERPLATE = [
  /right of appeal/i, /appeal must be filed/i, /subject to prosecution/i, /late fee will be charged/i,
  /make application for and obtain all the required permits/i, /approved set of plans must be kept/i,
  /property own+er or agent to (?:refer|contact)/i, /lead safe resource center/i,
];

/** Sentences or lines inside one finding; notices are dropped one at a time, not with the finding. */
const SENTENCE = /(?<=\.)\s+(?=[A-Z(])|\n+/;

/** "18 [3105.26]:" or "74[A17.1 8.6.4.20]:" or "MISC" at the start of each finding. */
const ITEM_START = /\s*(?:(?<=^|\s)\d{1,3}\s*)?\[[^\]]{1,40}\]\s*:?\s*|\s*\bMISC\b\s*/g;

const KEEP_AS: Record<string, string> = { hvac: "HVAC", gfci: "GFCI", epa: "EPA", cdph: "CDPH", odh: "ODH", ohio: "Ohio", cleveland: "Cleveland" };
const KEEP = new RegExp(`\\b(${Object.keys(KEEP_AS).join("|")})\\b`, "g");

function sentence(s: string): string {
  const t = s.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/,(?=\S)/g, ", ").trim().replace(/[:;,]$/, "");
  if (!t) return "";
  // Mostly capitals: lower it and capitalize the first letter. Mixed case is left as written.
  const letters = t.replace(/[^a-z]/gi, "");
  const caps = letters.replace(/[^A-Z]/g, "").length;
  // Lowering an all-caps form also lowers acronyms and place names; put the common ones back.
  const out = letters.length && caps / letters.length > 0.7 ? t.toLowerCase().replace(KEEP, (w) => KEEP_AS[w]!) : t;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** The findings in a violation description, in order, without form text, ordinance numbers or legal notices. */
export function violationItems(description: string | null | undefined): string[] {
  if (!description) return [];
  const body = description.replace(PREAMBLE, "");
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of body.split(ITEM_START)) {
    const kept = part.split(SENTENCE).filter((x) => !BOILERPLATE.some((re) => re.test(x.replace(/\s+/g, " "))));
    const s = sentence(kept.join(" "));
    if (s.length < 4) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(s);
  }
  return items;
}
