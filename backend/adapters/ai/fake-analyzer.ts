import { CATEGORY_VALUES } from '@pulso/core';
import type { Category, IncidentAnalyzer } from '@pulso/core';

/**
 * Local, no-API analyzer for offline dev and demos without spending OpenAI calls.
 * Output is deterministic per image URL so repeated runs are stable.
 */
export class FakeAnalyzer implements IncidentAnalyzer {
  async analyze(input: { imageUrl: string }): Promise<{
    category: Category;
    severity: number;
    title: string;
    description: string;
  }> {
    const seed = [...input.imageUrl].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const category = CATEGORY_VALUES[seed % CATEGORY_VALUES.length] as Category;
    const severity = (seed % 5) + 1;
    return {
      category,
      severity,
      title: 'Incidente detectado',
      description: 'Análisis simulado (FakeAnalyzer): revisa y edita antes de publicar.',
    };
  }
}
