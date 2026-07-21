import type { IncidentRepository } from '../ports';

/** Fetch one incident's details (no reporter PII). */
export function makeGetIncidentDetails({ incidents }: { incidents: IncidentRepository }) {
  return async (input: { incidentId: string }) => incidents.getDetails(input.incidentId);
}
