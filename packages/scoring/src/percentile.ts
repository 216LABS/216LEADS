/**
 * Percentile rank (0..1) of each value among the non-null values, ties share the
 * lower rank. Nulls map to null. Order of the output matches the input.
 */
export function percentileRanks(values: (number | null | undefined)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b);
  const n = present.length;
  if (n === 0) return values.map(() => null);
  if (n === 1) return values.map((v) => (v === null || v === undefined ? null : 0.5));
  const rankOf = (v: number) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (present[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / (n - 1);
  };
  return values.map((v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.min(1, rankOf(v))));
}
