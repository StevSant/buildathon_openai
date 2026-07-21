import type {
  EmergencyContact,
  EmergencyContactStatus,
  Profile,
  ProfileRepository,
  VerificationMethod,
} from '@pulso/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashCedula } from './hash-cedula';

/**
 * Supabase-backed profiles repository. The client is injected (Node or Deno). The
 * raw cédula is hashed here with the injected pepper and never persisted or returned.
 */
export class SupabaseProfileRepository implements ProfileRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly config: { cedulaHashPepper: string },
  ) {}

  async createVerified(input: {
    userId: string;
    cedula: string;
    method: VerificationMethod;
  }): Promise<Profile> {
    const cedulaHash = await hashCedula(input.cedula, this.config.cedulaHashPepper);

    const { data, error } = await this.client
      .from('profiles')
      .upsert({
        id: input.userId,
        cedula_hash: cedulaHash,
        verified: true,
        verification_method: input.method,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return this.toProfile(data as Record<string, any>);
  }

  async getById(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return data ? this.toProfile(data as Record<string, any>) : null;
  }

  async getEmergencyContacts(input: {
    userId: string;
    status?: EmergencyContactStatus;
  }): Promise<EmergencyContact[]> {
    let query = this.client.from('emergency_contacts').select('*').eq('owner_id', input.userId);
    if (input.status) query = query.eq('opt_in_status', input.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map(
      (row: Record<string, any>): EmergencyContact => ({
        id: row.id,
        ownerId: row.owner_id,
        name: row.display_name ?? null,
        phone: row.phone_e164,
        status: row.opt_in_status,
        createdAt: row.created_at,
      }),
    );
  }

  private toProfile(row: Record<string, any>): Profile {
    return {
      id: row.id,
      displayName: row.display_name ?? null,
      verified: Boolean(row.verified),
      verificationMethod: row.verification_method ?? null,
      trustScore: row.trust_score ?? 0,
      createdAt: row.created_at,
    };
  }
}
