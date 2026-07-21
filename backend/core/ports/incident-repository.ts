import type {
  AlertRecipient,
  Category,
  ConfirmationKind,
  Incident,
  IncidentDetails,
  IncidentStatus,
  NearbyIncident,
  Severity,
} from '../domain';

/** Persistence port for incidents and their geospatial/community queries. */
export interface IncidentRepository {
  findNearby(input: {
    lat: number;
    long: number;
    radiusMeters?: number;
    category?: Category | null;
  }): Promise<NearbyIncident[]>;

  getDetails(id: string): Promise<IncidentDetails | null>;

  create(input: {
    reporterId: string;
    title: string;
    description?: string | null;
    category: Category;
    severity: Severity;
    lat: number;
    long: number;
    photoPath?: string | null;
    ttlHours?: number;
  }): Promise<Incident>;

  confirm(
    id: string,
    userId: string,
    kind: ConfirmationKind,
  ): Promise<{ id: string; confirmations: number; status: IncidentStatus }>;

  /**
   * WhatsApp/SOS proximity feature: resolve the users whose `alert_rules` match a
   * freshly inserted incident (severity ≥ min_severity AND within radius), each
   * bundled with their accepted emergency contacts.
   */
  findAlertRecipients(input: { incidentId: string }): Promise<AlertRecipient[]>;
}
