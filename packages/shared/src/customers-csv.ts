// "Upload my current customers" (spec 9.1 step 3). Runs in the browser: only "street, zip" lines
// leave the device, so names, emails and phones in the user's file are never uploaded.

/** Split one CSV line, honoring double quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t" || ch === ";") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const ZIP = /^\d{5}(-\d{4})?$/;
const STREET = /^\d+[A-Z]?\s+\S/i;

/**
 * Address lines ("1234 W 117TH ST, 44111") from a customer CSV. Uses the address and zip
 * columns when the header names them; otherwise the first cell that looks like a street address
 * and the first 5-digit zip in each row. Rows without both are skipped.
 */
export function customerLinesFromCsv(text: string, max = 5000): string[] {
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).map(cells);
  if (!rows.length) return [];
  const head = rows[0]!.map((h) => h.toLowerCase());
  const looksLikeHeader = head.some((h) => /address|street|zip|postal/.test(h)) && !head.some((h) => STREET.test(h));
  const addrCol = looksLikeHeader ? head.findIndex((h) => /address|street/.test(h) && !/2|line ?2|email|city|zip/.test(h)) : -1;
  const zipCol = looksLikeHeader ? head.findIndex((h) => /zip|postal/.test(h)) : -1;
  const out = new Set<string>();
  for (const r of looksLikeHeader ? rows.slice(1) : rows) {
    let street = addrCol >= 0 ? (r[addrCol] ?? "") : (r.find((c) => STREET.test(c)) ?? "");
    let zip = zipCol >= 0 ? (r[zipCol] ?? "") : (r.find((c) => ZIP.test(c)) ?? "");
    // "1234 Main St, Lakewood, OH 44107" in a single cell.
    const inline = street.match(/^(.*?),.*?\b(\d{5})(?:-\d{4})?\s*$/);
    if (inline) {
      street = inline[1]!;
      zip = zip || inline[2]!;
    }
    zip = zip.match(/\d{5}/)?.[0] ?? "";
    street = street.split(",")[0]!.trim();
    if (STREET.test(street) && zip) out.add(`${street.toUpperCase()}, ${zip}`);
    if (out.size >= max) break;
  }
  return [...out];
}
