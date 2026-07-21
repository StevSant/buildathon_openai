import type { Severity } from './severity';

/**
 * A user's personal proximity-alert rule: fire a WhatsApp when an incident at or
 * above `min_severity` lands within `radius_meters` of their watch `center`.
 *
 * snake_case DTO — rows from the `alert_rules` table (migration 0002) cast straight
 * to it, same convention as NearbyIncident / IncidentDetails.
 */
export interface AlertRule {
  id: string;
  user_id: string;
  min_severity: Severity;
  radius_meters: number;
  channel: 'whatsapp';
  enabled: boolean;
  created_at: string;
}
