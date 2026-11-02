// Monthly ROI PDF (spec 9.6): one letter page with the month's metrics, a mailed-vs-won bar chart
// for the last 12 months and the first proof rows. Standard fonts only, so no font files ship.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BRAND } from "@216leads/shared";
import type { MonthPoint, ProofRow, RoiMetrics } from "./roi";

const NAVY = rgb(0.06, 0.16, 0.32);
const SLATE = rgb(0.38, 0.43, 0.5);
const GREEN = rgb(0.09, 0.55, 0.33);
const LINE = rgb(0.86, 0.88, 0.91);

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const OUTCOME: Record<string, string> = { won_self: "Won by you", lost_competitor: "Went to", sold: "Sold", unknown: "Permit, no business named" };

/** Standard fonts are WinAnsi only; replace anything else so a stray character can't break the file. */
const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, "?");

function text(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = NAVY) {
  page.drawText(safe(s), { x, y, size, font, color });
}

export async function roiPdf(o: { orgName: string; month: string; metrics: RoiMetrics; series: MonthPoint[]; proof: ProofRow[] }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${o.orgName} ROI ${o.month}`);
  doc.setProducer(BRAND.name);
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const m = o.metrics;

  text(page, BRAND.name, 48, 744, 11, bold, SLATE);
  text(page, `${o.orgName}: results for ${o.month}`, 48, 718, 20, bold);
  text(page, `${m.from} to ${m.to}`, 48, 700, 10, font, SLATE);

  const tiles: [string, string][] = [
    ["Homes surfaced", m.surfaced.toLocaleString("en-US")], ["Contacted", m.contacted.toLocaleString("en-US")],
    ["Postcards mailed", m.mailed.toLocaleString("en-US")], ["Quotes", m.quotes.toLocaleString("en-US")],
    ["Jobs won", m.won.toLocaleString("en-US")], ["Revenue won", money(m.revenue)],
    ["Cost (plan + postcards)", money(m.costSubscription + m.costPostcards)], ["ROI", m.roi === null ? "n/a" : `${m.roi}x`],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 48 + (i % 4) * 129;
    const y = 640 - Math.floor(i / 4) * 64;
    page.drawRectangle({ x, y, width: 120, height: 52, borderColor: LINE, borderWidth: 1 });
    text(page, label, x + 8, y + 34, 8, font, SLATE);
    text(page, value, x + 8, y + 12, 16, bold);
  });

  // Mailed vs won, last 12 months.
  text(page, "Mailed vs won, last 12 months", 48, 540, 12, bold);
  const max = Math.max(1, ...o.series.map((p) => Math.max(p.mailed, p.won)));
  const baseY = 410;
  o.series.forEach((p, i) => {
    const x = 52 + i * 42;
    const hm = (p.mailed / max) * 110;
    const hw = (p.won / max) * 110;
    page.drawRectangle({ x, y: baseY, width: 15, height: Math.max(hm, 0.5), color: NAVY });
    page.drawRectangle({ x: x + 17, y: baseY, width: 15, height: Math.max(hw, 0.5), color: GREEN });
    text(page, p.month.slice(2), x, baseY - 14, 7, font, SLATE);
  });
  page.drawRectangle({ x: 48, y: 384, width: 8, height: 8, color: NAVY });
  text(page, "Mailed", 60, 384, 8, font, SLATE);
  page.drawRectangle({ x: 100, y: 384, width: 8, height: 8, color: GREEN });
  text(page, "Won", 112, 384, 8, font, SLATE);

  // Proof from public records.
  text(page, "Proof from public records", 48, 350, 12, bold);
  text(page, "Homes you worked that later pulled a permit in your trade or sold.", 48, 336, 9, font, SLATE);
  let y = 316;
  if (!o.proof.length) text(page, "Nothing yet this month. Permits often post weeks after the work.", 48, y, 9, font, SLATE);
  for (const r of o.proof.slice(0, 18)) {
    const who = r.outcome === "lost_competitor" ? `${OUTCOME[r.outcome]} ${r.competitor ?? "a competitor"}` : OUTCOME[r.outcome] ?? r.outcome;
    text(page, r.event_date, 48, y, 9, font, SLATE);
    text(page, `${r.addr_line}, ${r.city}`.slice(0, 44), 112, y, 9, bold);
    text(page, `${who} (${r.days_to_event} days after you${r.mailed ? " mailed" : " reached out"})`.slice(0, 62), 330, y, 9, font);
    page.drawLine({ start: { x: 48, y: y - 5 }, end: { x: 564, y: y - 5 }, thickness: 0.5, color: LINE });
    y -= 16;
  }
  text(page, `${BRAND.footerAddress}. Figures from your 216 HomeSignal account and public permit and sale records.`, 48, 36, 7, font, SLATE);
  return doc.save();
}
