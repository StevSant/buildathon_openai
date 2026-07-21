import type { VerificationMethod } from '../domain';

/** Verifies a cédula against a real registry or an algorithmic fallback. */
export interface IdentityVerifier {
  verify(cedula: string): Promise<{
    valid: boolean;
    method: VerificationMethod;
    reason?: string;
  }>;
}
