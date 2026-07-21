import type { Category } from './category';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/**
 * Row returned by the `get_nearby_incidents` query: incident + distance + coordinates,
 * no PII. Field names are snake_case to match the SQL columns verbatim — the frontend
 * casts RPC rows straight to this shape (see plans/CONTRACT.md §2).
 */
export interface NearbyIncident {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  severity: Severity;
  status: IncidentStatus;
  distance_meters: number;
  confirmations: number;
  created_at: string;
  lng: number;
  lat: number;
}
