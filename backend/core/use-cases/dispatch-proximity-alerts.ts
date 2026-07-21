import type { IncidentRepository, MessagingGateway, ProfileRepository } from '../ports';

/** Dispatch proximity and SOS alerts through the Hermes webhook. */
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
      | { kind: 'proximity'; incidentId: string; context?: Record<string, unknown> }
      | { kind: 'sos'; userId: string; context?: Record<string, unknown> },
  ): Promise<{
    sent: number;
    failed: number;
    results: Array<{ contactId: string; id: string; status: string }>;
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

    const results: Array<{ contactId: string; id: string; status: string }> = [];
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      for (const contact of recipient.contacts) {
        // get_alert_matches has no status field; SOS contacts are explicitly filtered.
        if ('status' in contact && contact.status !== 'accepted') continue;
        try {
          const delivery = await messaging.sendWhatsApp({
            to: contact.phone,
            kind: input.kind,
            context: input.context,
          });
          results.push({ contactId: contact.id, ...delivery });
          sent += 1;
        } catch {
          // One unavailable recipient must not abort the rest of the emergency fan-out.
          results.push({ contactId: contact.id, id: '', status: 'failed' });
          failed += 1;
        }
      }
    }

    return { sent, failed, results };
  };
}
