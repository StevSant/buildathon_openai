import type { IncidentAnalyzer } from '../ports';

/** Analyze a report photo into structured incident fields for the user to review. */
export function makeAnalyzeReport({ analyzer }: { analyzer: IncidentAnalyzer }) {
  return async (input: { imageUrl: string }) => analyzer.analyze(input);
}
