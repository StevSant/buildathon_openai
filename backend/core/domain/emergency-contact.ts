import type { EmergencyContactStatus } from './emergency-contact-status';

/** A person a user wants alerted (via WhatsApp) about nearby danger or SOS. */
export interface EmergencyContact {
  id: string;
  ownerId: string;
  name: string | null;
  phone: string;
  status: EmergencyContactStatus;
  createdAt: string;
}
