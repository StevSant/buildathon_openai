import type { Category } from './category';

/**
 * Runtime list of every {@link Category}. Kept in one place so adapters (e.g. the
 * vision structured-output schema and the local FakeAnalyzer) never duplicate the
 * literal set.
 */
export const CATEGORY_VALUES: readonly Category[] = [
  'road_closure',
  'accident',
  'flood',
  'fire',
  'public_event',
  'other',
];
