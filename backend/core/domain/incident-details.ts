import type { Category } from './category';
import type { ConfirmationKind } from './confirmation-kind';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/**
 * Row returned by `get_incident_details`: one incident, anonymous to users. The only
 * reporter-derived field is `reporter_verified` (ADR-020); never a name, cédula, or email.
 * Snake_case matches the SQL columns and mirrors NearbyIncident minus `distance_meters`
 * (the client derives distance from lng/lat), plus `disputes` and the public-bucket
 * `photo_path` added in migration 0003.
 *
 * The three viewer-specific fields (migration 0007) are anonymous eligibility state derived
 * from the caller's own auth.uid() — never the reporter's identity:
 *   - `viewer_is_reporter` — did this viewer author the report (hide vote controls, #13)
 *   - `can_vote`           — may this viewer vote at all (everyone except the author, #13)
 *   - `viewer_vote`        — this viewer's own current vote, if any (#14)
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
  viewer_is_reporter: boolean;
  can_vote: boolean;
  viewer_vote: ConfirmationKind | null;
  created_at: string;
  lng: number;
  lat: number;
  photo_path: string | null;
}
