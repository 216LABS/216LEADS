export const TZ = "America/New_York";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar date in America/New_York for an instant, as YYYY-MM-DD. */
export function etDate(d: Date | number): string {
  return ymd.format(typeof d === "number" ? new Date(d) : d);
}

/** ArcGIS epoch-ms UTC -> ET calendar date, or null. */
export function epochToEtDate(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return etDate(ms);
}

export function todayEt(): string {
  return etDate(Date.now());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T12:00:00Z`);
  const b = Date.parse(`${toIso}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function currentYearEt(): number {
  return Number(todayEt().slice(0, 4));
}

/** "Sold 6 days ago" style relative phrase. */
export function agoPhrase(isoDate: string, now = todayEt()): string {
  const d = daysBetween(isoDate, now);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} yrs ago`;
}
