import type { MessagingGateway } from '@pulso/core';

/**
 * Sends WhatsApp messages through the Hermes API. Config (URL, key, sender) is
 * injected from env (HERMES_API_URL / HERMES_API_KEY / HERMES_WHATSAPP_FROM).
 */
export class HermesWhatsAppGateway implements MessagingGateway {
  constructor(
    private readonly config: { apiUrl: string; apiKey: string; from: string },
  ) {}

  async sendWhatsApp(input: {
    to: string;
    template: string;
    params?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      // TODO: align with Hermes' real WhatsApp send payload.
      body: JSON.stringify({
        from: this.config.from,
        to: input.to,
        template: input.template,
        params: input.params ?? {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Hermes send failed: ${response.status}`);
    }

    const data = (await response.json()) as { id?: string; status?: string };
    return { id: data.id ?? '', status: data.status ?? 'unknown' };
  }
}
