import type { IncidentStatus } from './incident-status';

/** Spanish display label for each incident lifecycle state (UI + agent presentation). */
export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  provisional: 'sin confirmar',
  confirmed: 'verificado por la comunidad',
  disputed: 'en duda',
  resolved: 'resuelto',
};
