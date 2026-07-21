/** Sends outbound WhatsApp messages by triggering the Hermes `pulso-alerts` webhook. */
export interface MessagingGateway {
  sendWhatsApp(input: {
    to: string;
    kind: 'proximity' | 'sos' | 'optin';
    context?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
}
