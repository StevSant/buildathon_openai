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

    // TODO: map the provider's real response shape.
    const data = (await response.json()) as { valid?: boolean; reason?: string };
    return {
      valid: Boolean(data.valid),
      method: 'registry',
      reason: data.reason,
    };
  }
}
