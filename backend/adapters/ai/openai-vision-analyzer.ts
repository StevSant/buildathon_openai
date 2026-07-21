import { CATEGORY_VALUES } from '@pulso/core';
import type { Category, IncidentAnalyzer } from '@pulso/core';
import type OpenAI from 'openai';

/**
 * Analyzes a report photo with the OpenAI Responses API using a strict JSON-schema
 * structured output. The OpenAI client is injected (typed via `import type`) so this
 * file carries no runtime dependency and can be imported from Deno too.
 */
export class OpenAIVisionAnalyzer implements IncidentAnalyzer {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async analyze(input: { imageUrl: string }): Promise<{
    category: Category;
    severity: number;
    title: string;
    description: string;
  }> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'Eres un analista de incidentes urbanos. Observa la foto y devuelve ' +
                'categoría, severidad (1-5), un título breve y una descripción en español.',
            },
            { type: 'input_image', image_url: input.imageUrl, detail: 'auto' },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'incident_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['category', 'severity', 'title', 'description'],
            properties: {
              category: { type: 'string', enum: [...CATEGORY_VALUES] },
              severity: { type: 'integer', minimum: 1, maximum: 5 },
              title: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    });

    const text = response.output_text;
    if (!text) {
      throw new Error('El modelo no devolvió un análisis (respuesta vacía).');
    }
    return JSON.parse(text) as {
      category: Category;
      severity: number;
      title: string;
      description: string;
    };
  }
}
