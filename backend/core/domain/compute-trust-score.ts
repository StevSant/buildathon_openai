/**
 * Compute a profile's trust score from verification and report outcomes. Pure, no
 * I/O — all weights are injected (from config), never hardcoded. Never negative.
 */
export function computeTrustScore(input: {
  verified: boolean;
  confirmedReports: number;
  disputedReports: number;
  verifiedBonus: number;
  perConfirmed: number;
  perDisputed: number;
}): number {
  const { verified, confirmedReports, disputedReports, verifiedBonus, perConfirmed, perDisputed } =
    input;

  const raw =
    (verified ? verifiedBonus : 0) +
    confirmedReports * perConfirmed -
    disputedReports * perDisputed;

  return Math.max(0, Math.round(raw));
}
