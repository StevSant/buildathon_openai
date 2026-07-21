import type { Category } from '../domain';

/** Analyzes a report photo into structured incident fields. */
export interface IncidentAnalyzer {
  analyze(input: { imageUrl: string }): Promise<{
    category: Category;
    severity: number;
    title: string;
    description: string;
  }>;
}
