/** Sends outbound messages (WhatsApp) for proximity alerts and manual SOS. */
export interface MessagingGateway {
  sendWhatsApp(input: {
    to: string;
    template: string;
    params?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
}
