import type { Severity } from './severity';

/**
 * Coerce an arbitrary number (e.g. a DB integer or a model's output) into the
 * valid {@link Severity} range 1–5. Pure, no I/O.
 */
export function clampSeverity(value: number): Severity {
  const rounded = Math.round(value);
  const bounded = Math.min(5, Math.max(1, rounded));
  return bounded as Severity;
}
