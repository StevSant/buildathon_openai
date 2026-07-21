import type { MessagingGateway } from '@pulso/core';

/** Triggers Hermes' `pulso-alerts` webhook; Hermes owns the WhatsApp transport. */
export class HermesWhatsAppGateway implements MessagingGateway {
  constructor(private readonly config: { webhookUrl: string; secret: string }) {}

  async sendWhatsApp(input: {
    to: string;
    kind: 'proximity' | 'sos' | 'optin';
    context?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    // The deliver-only webhook renders `{text}` verbatim, so the message is composed here.
    // Callers may pass a ready `context.text`; otherwise a per-kind default is used.
    const text =
      typeof input.context?.text === 'string' ? input.context.text : defaultMessage(input.kind);
    // Baileys chat_id is the phone as digits only (country code, no '+'). phone_e164
    // is stored with '+', so normalize before the webhook deliver-chat-id sees it.
    const to = input.to.replace(/\D/g, '');
    // Serialize once: Hermes V2 signs the exact bytes that are transmitted.
    const body = JSON.stringify({ to, text, kind: input.kind, ...(input.context ?? {}) });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await hmacSha256Hex(this.config.secret, `${timestamp}.${body}`);
    // The same alert payload gets the same delivery ID, so Hermes suppresses retried requests.
    const requestId = await sha256Hex(body);

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature-v2': signature,
        'x-request-id': `pulso-${requestId}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Hermes webhook failed: ${response.status}`);
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string; status?: string };
    return { id: data.id ?? `pulso-${requestId}`, status: data.status ?? 'queued' };
  }
}

function defaultMessage(kind: 'proximity' | 'sos' | 'optin'): string {
  switch (kind) {
    case 'optin':
      return '🔔 *Pulso* — Activaste las alertas por WhatsApp para este número. Te avisaremos cuando haya incidentes cerca de tu zona. Si no fuiste tú, ignora este mensaje.';
    case 'sos':
      return '🆘 *Pulso* — Alguien activó un SOS cerca de ti. Mantente alerta; si es una emergencia, llama al ECU 911.';
    case 'proximity':
    default:
      return '⚠️ *Pulso* — Se reportó un incidente cerca de tu zona. Abre Pulso para ver los detalles.';
  }
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return toHex(signature);
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
