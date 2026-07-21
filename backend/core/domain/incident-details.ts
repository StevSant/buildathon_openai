import type { Category } from './category';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/**
 * Row returned by `get_incident_details`: one incident plus the reporter's public
 * name and verified flag only — never cédula or email. Snake_case to match the SQL
 * columns (see plans/CONTRACT.md §2). Mirrors NearbyIncident minus `distance_meters`
 * (a single-incident lookup has no user origin to measure from) plus the reporter fields.
 */
export interface IncidentDetails {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  severity: Severity;
  status: IncidentStatus;
  confirmations: number;
  reporter_name: string | null;
  reporter_verified: boolean;
  created_at: string;
  lng: number;
  lat: number;
}
