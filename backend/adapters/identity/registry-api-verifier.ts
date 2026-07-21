import type { IdentityVerifier, VerificationMethod } from '@pulso/core';

/**
 * Verifier backed by an external cédula registry provider. Config (URL + key) is
 * injected from env (IDENTITY_VERIFY_API_URL / IDENTITY_VERIFY_API_KEY). On any
 * transport/HTTP failure it throws, so a CompositeVerifier can fall back.
 */
export class RegistryApiVerifier implements IdentityVerifier {
  constructor(private readonly config: { apiUrl: string; apiKey: string }) {}

  async verify(
    cedula: string,
  ): Promise<{ valid: boolean; method: VerificationMethod; reason?: string }> {
    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ cedula }),
    });

    if (!response.ok) {
      // Throwing lets CompositeVerifier route to the algorithmic fallback.
      throw new Error(`Identity provider responded ${response.status}`);
    }

    const data = (await response.json()) as { valid?: unknown; reason?: unknown };
    if (typeof data.valid !== 'boolean') {
      // Unknown shape → don't guess; fall back to the algorithmic verifier.
      throw new Error('Identity provider returned an unrecognized body');
    }

    return {
      valid: data.valid,
      method: 'registry',
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    };
  }
}
