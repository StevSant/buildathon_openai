import type { IncidentRepository, MessagingGateway, ProfileRepository } from '../ports';

/**
 * Dispatch WhatsApp alerts to emergency contacts. Two entry points share the same
 * dispatch logic:
 *  - `proximity`: a freshly inserted incident matched some users' alert rules;
 *    notify each matched user's accepted contacts.
 *  - `sos`: the user pressed the manual SOS button; notify their accepted contacts.
 *
 * The Hermes `template` name is supplied by the caller (composition root) from env
 * (WHATSAPP_PROXIMITY_TEMPLATE / WHATSAPP_SOS_TEMPLATE) — never hardcoded here.
 */
export function makeDispatchProximityAlerts({
  messaging,
  incidents,
  profiles,
}: {
  messaging: MessagingGateway;
  incidents: IncidentRepository;
  profiles: ProfileRepository;
}) {
  return async (
    input:
      | { kind: 'proximity'; incidentId: string; template: string; params?: Record<string, unknown> }
      | { kind: 'sos'; userId: string; template: string; params?: Record<string, unknown> },
  ): Promise<{
    sent: number;
    failed: number;
    results: Array<{ id: string; status: string }>;
  }> => {
    const recipients =
      input.kind === 'proximity'
        ? await incidents.findAlertRecipients({ incidentId: input.incidentId })
        : [
            {
              userId: input.userId,
              contacts: await profiles.getEmergencyContacts({
                userId: input.userId,
                status: 'accepted',
              }),
            },
          ];

    // Both sources return only opted-in contacts already: get_alert_matches filters
    // opt_in_status = 'accepted' in SQL, and the SOS path queries status: 'accepted'.
    const results: Array<{ id: string; status: string }> = [];
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      for (const contact of recipient.contacts) {
        try {
          const result = await messaging.sendWhatsApp({
            to: contact.phone,
            template: input.template,
            params: input.params,
          });
          results.push(result);
          sent += 1;
        } catch {
          // Isolate delivery failures: one unavailable contact must not block the rest.
          results.push({ id: contact.id, status: 'failed' });
          failed += 1;
        }
      }
    }

    return { sent, failed, results };
  };
}
