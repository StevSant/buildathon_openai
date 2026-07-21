import type {
  EmergencyContact,
  EmergencyContactStatus,
  Profile,
  VerificationMethod,
} from '../domain';

/** Persistence port for verified profiles and their emergency contacts. */
export interface ProfileRepository {
  /**
   * Create/patch the caller's verified profile. The raw cédula flows in here and is
   * hashed with the pepper by the adapter — it is never persisted or returned.
   */
  createVerified(input: {
    userId: string;
    cedula: string;
    method: VerificationMethod;
  }): Promise<Profile>;

  getById(userId: string): Promise<Profile | null>;

  /**
   * WhatsApp/SOS feature: the user's emergency contacts, optionally filtered by
   * opt-in status (the manual-SOS path requests only `accepted` ones).
   */
  getEmergencyContacts(input: {
    userId: string;
    status?: EmergencyContactStatus;
  }): Promise<EmergencyContact[]>;
}
