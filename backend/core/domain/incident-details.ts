import type { Category } from './category';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/**
 * Row returned by `get_incident_details`: one incident, anonymous to users. The only
 * reporter-derived field is `reporter_verified` (ADR-020); never a name, cédula, or email.
 * Snake_case matches the SQL columns and mirrors NearbyIncident minus `distance_meters`
 * (the client derives distance from lng/lat), plus `disputes` and the public-bucket
 * `photo_path` added in migration 0003.
 */
export interface IncidentDetails {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  severity: Severity;
  status: IncidentStatus;
  confirmations: number;
  disputes: number;
  reporter_verified: boolean;
  created_at: string;
  lng: number;
  lat: number;
  photo_path: string | null;
}
