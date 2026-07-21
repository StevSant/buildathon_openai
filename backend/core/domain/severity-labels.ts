import type { Severity } from './severity';

/** Spanish display label for each severity level (UI + agent presentation). */
export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'muy baja',
  2: 'baja',
  3: 'media',
  4: 'alta',
  5: 'crítica',
};
