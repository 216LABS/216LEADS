// System postcard templates (spec 9.5): 3 designs per trade, 4x6 with bleed (6.25 x 4.25 in).
// Front: headline + simple art. Back: offer, phone, site, QR to the site with UTM tags, return
// address and the required small print. The right half of the back is left clear for the
// provider's "Current Resident" address block.
import QRCode from "qrcode";
import { optionalEnv } from "@216leads/db";
import { basePath, BRAND, tradeInText } from "@216leads/shared";

/** Printed opt-out address (issue #1): APP_BASE_URL host + base path + /optout, e.g. 216labs.dev/homesignal/optout. */
export function optoutDisplayUrl(): string {
  const base = optionalEnv("APP_BASE_URL");
  if (!base) return BRAND.optoutUrl;
  const u = new URL(base);
  return `${u.host}${basePath()}/optout`.replace(/^www\./, "");
}

export const DESIGNS = ["neighbors", "welcome", "checkup"] as const;
export type Design = (typeof DESIGNS)[number];

export interface PostcardFields {
  business: string;
  headline: string;
  offer: string;
  expiry: string | null;
  phone: string;
  website: string | null;
  logoUrl: string | null;
  returnAddress: string;
}

const NAVY = "#0F2A44";
const ORANGE = "#F26B1D";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Default headline per design; {street} and {year_built} are filled per home. */
export function defaultHeadline(design: Design, trade: string): string {
  const t = tradeInText(trade);
  switch (design) {
    case "neighbors":
      return `Your neighbors near {street} are getting ${t} work done.`;
    case "welcome":
      return "Welcome to the neighborhood. We're the local crew for your new home.";
    case "checkup":
      return `Built in {year_built}? Time for a ${t} check.`;
  }
}

export function designLabel(d: Design): string {
  return { neighbors: "Neighbors", welcome: "New homeowner", checkup: "Home check-up" }[d];
}

/** Fill {street} / {year_built} for one home, with sensible fallbacks. */
export function personalize(headline: string, home: { street: string | null; year_built: number | null }): string {
  return headline
    .replace(/\{street\}/g, home.street ?? "you")
    .replace(/Built in \{year_built\}\? /g, home.year_built ? `Built in ${home.year_built}? ` : "")
    .replace(/\{year_built\}/g, home.year_built ? String(home.year_built) : "your home's year");
}

/** The business site with UTM tags, so visits from the card show up in their analytics. */
export function utmUrl(website: string | null, design: Design): string | null {
  if (!website) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    u.searchParams.set("utm_source", "216homesignal");
    u.searchParams.set("utm_medium", "postcard");
    u.searchParams.set("utm_campaign", design);
    return u.toString();
  } catch {
    return null;
  }
}

const page = (body: string) =>
  `<html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{width:6.25in;height:4.25in;font-family:Helvetica,Arial,sans-serif;color:${NAVY}}</style></head><body>${body}</body></html>`;

function art(design: Design): string {
  // Simple vector art (no stock photos): a row of houses, a key, or a checklist.
  if (design === "welcome") {
    return `<svg width="120" height="120" viewBox="0 0 48 48"><circle cx="16" cy="24" r="9" fill="none" stroke="${ORANGE}" stroke-width="4"/><path d="M25 24h17v6M36 24v5" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round"/></svg>`;
  }
  if (design === "checkup") {
    return `<svg width="120" height="120" viewBox="0 0 48 48"><rect x="10" y="6" width="28" height="36" rx="3" fill="none" stroke="${ORANGE}" stroke-width="3.5"/><path d="M16 18l4 4 8-8M16 31h16" fill="none" stroke="${ORANGE}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `<svg width="150" height="90" viewBox="0 0 75 45">${[0, 25, 50].map((x, i) => `<path d="M${x + 2} 24 ${x + 12} 14 ${x + 22} 24v19H${x + 2}z" fill="${i === 1 ? ORANGE : "none"}" stroke="${ORANGE}" stroke-width="2.5" stroke-linejoin="round"/>`).join("")}</svg>`;
}

export async function renderPostcard(design: Design, f: PostcardFields): Promise<{ front: string; back: string }> {
  const logo = f.logoUrl ? `<img src="${esc(f.logoUrl)}" style="height:0.45in;max-width:1.6in;object-fit:contain;background:#fff;border-radius:6px;padding:3px"/>` : "";
  const front = page(`
    <div style="width:6.25in;height:4.25in;background:${NAVY};color:#fff;padding:0.45in;display:flex;flex-direction:column;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:10px">${logo}<span style="font-size:15pt;font-weight:700">${esc(f.business)}</span></div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px">
        <div style="font-size:24pt;line-height:1.1;font-weight:800;max-width:3.9in">${esc(f.headline)}</div>
        <div>${art(design)}</div>
      </div>
    </div>`);
  const site = utmUrl(f.website, design);
  const qr = site ? await QRCode.toString(site, { type: "svg", margin: 0, width: 72, color: { dark: NAVY, light: "#ffffff" } }) : "";
  const back = page(`
    <div style="width:6.25in;height:4.25in;padding:0.3in;display:flex;gap:0.2in">
      <div style="width:2.6in;display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div style="font-size:15pt;font-weight:800;line-height:1.15">${esc(f.offer)}</div>
          ${f.expiry ? `<div style="font-size:8pt;margin-top:4px">Offer ends ${esc(f.expiry)}.</div>` : ""}
          <div style="font-size:16pt;font-weight:800;color:${ORANGE};margin-top:10px">${esc(f.phone)}</div>
          ${f.website ? `<div style="font-size:9pt;margin-top:2px">${esc(f.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</div>` : ""}
          ${qr ? `<div style="width:0.75in;height:0.75in;margin-top:8px">${qr}</div>` : ""}
        </div>
        <div style="font-size:6.5pt;line-height:1.3">
          <div>${esc(f.business)} · ${esc(f.returnAddress)}</div>
          <div>Based on public records. To stop mail: ${esc(optoutDisplayUrl())}</div>
        </div>
      </div>
      <div style="flex:1"></div>
    </div>`);
  return { front, back };
}

/** Fields an org fills in the builder; anything missing falls back to the org profile. */
export interface TemplateMerge {
  headline?: string;
  offer?: string;
  expiry?: string | null;
  phone?: string;
  website?: string | null;
}
