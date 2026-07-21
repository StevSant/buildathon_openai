import type { ConfirmationKind } from '../domain';
import type { IncidentRepository } from '../ports';

/** Record a community confirmation or dispute on an incident. */
export function makeConfirmIncident({ incidents }: { incidents: IncidentRepository }) {
  return async (input: { incidentId: string; userId: string; kind: ConfirmationKind }) =>
    incidents.confirm(input.incidentId, input.userId, input.kind);
}
