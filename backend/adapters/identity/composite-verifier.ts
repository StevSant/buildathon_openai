import type { IdentityVerifier, VerificationMethod } from '@pulso/core';

/**
 * Tries a primary verifier and falls back to a secondary one if the primary throws.
 * Fallback is composition, not a buried `if`: wire it only when a real provider is
 * configured (registry → algorithmic).
 */
export class CompositeVerifier implements IdentityVerifier {
  constructor(
    private readonly primary: IdentityVerifier,
    private readonly fallback: IdentityVerifier,
  ) {}

  async verify(
    cedula: string,
  ): Promise<{ valid: boolean; method: VerificationMethod; reason?: string }> {
    try {
      return await this.primary.verify(cedula);
    } catch {
      return this.fallback.verify(cedula);
    }
  }
}
