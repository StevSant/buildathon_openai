import type { AgentSessionFactory } from '@pulso/core';
import { OPENAI_DEFAULT_BASE_URL } from './openai-default-base-url';
import type { RealtimePersona } from './realtime-persona';

/**
 * Mints an ephemeral OpenAI Realtime client secret via POST
 * /v1/realtime/client_secrets. Personas (TS constants) are injected by the
 * composition root; the real API key stays server-side and is never returned.
 */
export class OpenAIRealtimeSessionFactory implements AgentSessionFactory {
  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      voice: string;
      personas: Record<string, RealtimePersona>;
      apiBaseUrl?: string;
      transcriptionModel?: string;
    },
  ) {}

  async createSession(input: {
    personaId: string;
    context?: Record<string, unknown>;
  }): Promise<{ clientSecret: string; expiresAt: string }> {
    // Persona is chosen by a validated id (never a raw prompt from the client).
    const persona = this.config.personas[input.personaId];
    if (!persona) {
      throw new Error(`Unknown persona: ${input.personaId}`);
    }

    const lat = input.context?.lat;
    const lng = input.context?.lng;
    const locationHint =
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      typeof lng === 'number' &&
      Number.isFinite(lng)
        ? '\nContexto aproximado de ubicación: latitud ' +
          lat +
          ', longitud ' +
          lng +
          '. Úsalo solo para orientar la conversación; las herramientas reciben la ubicación real.'
        : '';

    const baseUrl = this.config.apiBaseUrl ?? OPENAI_DEFAULT_BASE_URL;
    const response = await fetch(`${baseUrl}/realtime/client_secrets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: this.config.model,
          audio: {
            output: { voice: this.config.voice },
            // Without this the API never emits input_audio_transcription events, so the
            // client would have no user-side transcript.
            ...(this.config.transcriptionModel
              ? { input: { transcription: { model: this.config.transcriptionModel } } }
              : {}),
          },
          instructions: persona.instructions + locationHint,
          tools: persona.tools ?? [],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Realtime session mint failed: ${response.status}`);
    }

    // POST /v1/realtime/client_secrets returns { value, expires_at, session }. Older/newer
    // shapes may nest it under client_secret — read both defensively.
    const data = (await response.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value: string; expires_at: number };
    };
    const clientSecret = data.client_secret?.value ?? data.value ?? '';
    const expiresAtEpoch = data.client_secret?.expires_at ?? data.expires_at;
    if (!clientSecret) {
      throw new Error('Realtime mint returned no client secret');
    }
    const expiresAt = expiresAtEpoch ? new Date(expiresAtEpoch * 1000).toISOString() : '';

    return { clientSecret, expiresAt };
  }
}
