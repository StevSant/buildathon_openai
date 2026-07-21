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

    const { data: existing, error: lookupError } = await this.client
      .from('profiles')
      .select('cedula_hash')
      .eq('id', input.userId)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    if (existing?.cedula_hash && existing.cedula_hash !== cedulaHash) {
      throw new Error('cedula_already_bound');
    }

    if (existing?.cedula_hash === cedulaHash) {
      const { data, error } = await this.client
        .from('profiles')
        .update({ verified: true, verification_method: input.method })
        .eq('id', input.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return this.toProfile(data as Record<string, any>);
    }

    if (existing) {
      const { data, error } = await this.client
        .from('profiles')
        .update({
          cedula_hash: cedulaHash,
          verified: true,
          verification_method: input.method,
        })
        .eq('id', input.userId)
        .is('cedula_hash', null)
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === '23505' || /duplicate key|cedula_hash/i.test(error.message)) {
          throw new Error('cedula_taken');
        }
        throw new Error(error.message);
      }
      if (data) return this.toProfile(data as Record<string, any>);

      // A concurrent verification bound this profile after our lookup. Never overwrite it.
      throw new Error('cedula_already_bound');
    }

    const { data, error } = await this.client
      .from('profiles')
      .insert({
        id: input.userId,
        cedula_hash: cedulaHash,
        verified: true,
        verification_method: input.method,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505' || /duplicate key|cedula_hash/i.test(error.message)) {
        const { data: concurrentProfile, error: concurrentLookupError } = await this.client
          .from('profiles')
          .select('cedula_hash')
          .eq('id', input.userId)
          .maybeSingle();
        if (concurrentLookupError) throw new Error(concurrentLookupError.message);
        if (!concurrentProfile) throw new Error('cedula_taken');
        if (concurrentProfile.cedula_hash !== cedulaHash) {
          throw new Error('cedula_already_bound');
        }

        const { data: verifiedProfile, error: verifyError } = await this.client
          .from('profiles')
          .update({ verified: true, verification_method: input.method })
          .eq('id', input.userId)
          .select()
          .single();
        if (verifyError) throw new Error(verifyError.message);
        return this.toProfile(verifiedProfile as Record<string, any>);
      }
      throw new Error(error.message);
    }

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
