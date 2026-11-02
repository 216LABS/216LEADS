// ROI date ranges (spec 9.6): a calendar month in ET, ending today for the current month.
import { todayEt } from "@216leads/shared";

export function monthRange(month?: string | null): { month: string; from: string; to: string } {
  const today = todayEt();
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= today.slice(0, 7) ? month : today.slice(0, 7);
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return { month: m, from: `${m}-01`, to: last < today ? last : today };
}

export function shiftMonth(month: string, by: number): string {
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export const isIsoDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
