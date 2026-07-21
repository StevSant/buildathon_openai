/** Whole minutes elapsed since an ISO timestamp, floored at 0 (bad input → 0). */
export function minutesSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 60_000));
}
