import type { IncidentStatus } from './incident-status';

/**
 * Derive the next incident status from community signals. Pure, no I/O — thresholds
 * are injected (from config), never hardcoded.
 *
 * Rules: `resolved` is terminal; a contested incident (disputes at threshold) is
 * flagged before confirmation is considered; otherwise it stays provisional.
 *
 * The `confirm_incident` RPC (migration 0001) applies these same rules atomically in
 * SQL — keep the two in sync if either changes.
 */
export function nextIncidentStatus(input: {
  current: IncidentStatus;
  confirmations: number;
  disputes: number;
  confirmThreshold: number;
  disputeThreshold: number;
}): IncidentStatus {
  const { current, confirmations, disputes, confirmThreshold, disputeThreshold } = input;

  if (current === 'resolved') return 'resolved';
  if (disputes >= disputeThreshold) return 'disputed';
  if (confirmations >= confirmThreshold) return 'confirmed';
  return 'provisional';
}
