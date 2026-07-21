import type { Category } from './category';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/** A reported urban incident, mirroring the `public.incidents` row (domain shape). */
export interface Incident {
  id: string;
  /** Null for system-owned seed rows; otherwise the reporting profile id. */
  reporterId: string | null;
  title: string;
  description: string | null;
  category: Category;
  severity: Severity;
  status: IncidentStatus;
  lat: number;
  long: number;
  photoPath: string | null;
  confirmations: number;
  createdAt: string;
  expiresAt: string | null;
}
