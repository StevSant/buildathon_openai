import type { Category } from '../domain';
import type { IncidentRepository } from '../ports';

/** List active incidents near a point, for the map and the voice agent. */
export function makeGetNearbyIncidents({ incidents }: { incidents: IncidentRepository }) {
  return async (input: {
    lat: number;
    long: number;
    radiusMeters?: number;
    category?: Category | null;
  }) => incidents.findNearby(input);
}
