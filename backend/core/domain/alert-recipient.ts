import type { AlertContact } from './alert-contact';

/**
 * A user whose alert rule matched an incident, bundled with the (already opted-in)
 * contacts to notify. Contacts come from get_alert_matches — slim (id + phone) only.
 */
export interface AlertRecipient {
  userId: string;
  contacts: AlertContact[];
}
