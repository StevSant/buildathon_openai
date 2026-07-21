import { validateCedula } from '@pulso/core';
import type { IdentityVerifier, VerificationMethod } from '@pulso/core';

/** Offline verifier: Ecuadorian module-10 validation. No external calls. */
export class AlgorithmicVerifier implements IdentityVerifier {
  async verify(
    cedula: string,
  ): Promise<{ valid: boolean; method: VerificationMethod; reason?: string }> {
    const valid = validateCedula(cedula);
    return {
      valid,
      method: 'algorithmic',
      reason: valid ? undefined : 'La cédula no supera la validación (módulo 10).',
    };
  }
}
