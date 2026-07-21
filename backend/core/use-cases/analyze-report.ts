import { CATEGORY_VALUES, clampSeverity } from '../domain';
import type { Category, Severity } from '../domain';
import type { IncidentAnalyzer } from '../ports';

type AnalyzeReportResult = {
  category: Category;
  severity: Severity;
  title: string;
  description: string;
};

/**
 * Analyze a report photo into structured, VALIDATED incident fields for the user to review.
 * The analyzer output is untrusted (a model or a fake), so category is bounded to the known
 * set and severity is clamped to 1–5 before it leaves the server (CONTRACT §4 shape).
 */
export function makeAnalyzeReport({ analyzer }: { analyzer: IncidentAnalyzer }) {
  return async (input: { imageUrl: string }): Promise<AnalyzeReportResult> => {
    const raw = await analyzer.analyze(input);

    const category: Category = CATEGORY_VALUES.includes(raw.category)
      ? raw.category
      : 'other';
    const severity: Severity = clampSeverity(raw.severity);
    const title = raw.title?.trim() || 'Incidente';
    const description = raw.description?.trim() || '';

    return { category, severity, title, description };
  };
}
