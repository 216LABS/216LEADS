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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** A source's refresh schedule (cron in ET, as in the source table) in words: "Daily at 5:15 AM ET". */
export function cronText(cron: string): string {
  if (cron === "@once") return "One-time load";
  if (cron === "manual") return "When new records arrive";
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  if (!min || !hour || !dom || !mon || !dow || !/^\d+$/.test(min) || !/^\d+$/.test(hour)) return cron;
  const h = Number(hour);
  const at = `at ${h % 12 || 12}:${min.padStart(2, "0")} ${h < 12 ? "AM" : "PM"} ET`;
  const days = dom === "*" ? [] : dom.split(",").map(Number);
  if (dom === "*" && mon === "*" && dow === "*") return `Daily ${at}`;
  if (dom === "*" && mon === "*" && /^\d$/.test(dow)) return `Weekly on ${DAYS[Number(dow) % 7]} ${at}`;
  if (mon === "*" && dow === "*" && days.every(Number.isInteger)) return `Monthly on the ${list(days.map(ordinal))} ${at}`;
  if (/^\d+$/.test(mon) && dow === "*" && days.length === 1) return `Yearly on ${MONTHS[Number(mon) - 1]} ${days[0]} ${at}`;
  return cron;
}

/** A timestamp as an ET date and time, labeled: "Nov 2, 2026, 10:40 PM ET". */
export function etDateTime(iso: string): string {
  return `${new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
}
