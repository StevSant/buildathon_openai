import type { IdentityVerifier, ProfileRepository } from '../ports';
import type { Profile, VerificationMethod } from '../domain';

type VerifyIdentityResult =
  | { verified: false; reason?: string }
  | { verified: true; method: VerificationMethod; profile: Profile };

/**
 * Verify a cédula and, when valid, mark the caller's profile verified. The raw cédula is
 * passed to the repository (which hashes it) and never stored by this use-case.
 */
export function makeVerifyIdentity({
  verifier,
  profiles,
}: {
  verifier: IdentityVerifier;
  profiles: ProfileRepository;
}) {
  return async (input: { userId: string; cedula: string }): Promise<VerifyIdentityResult> => {
    const result = await verifier.verify(input.cedula);
    if (!result.valid) {
      return { verified: false, reason: result.reason };
    }

    try {
      const profile = await profiles.createVerified({
        userId: input.userId,
        cedula: input.cedula,
        method: result.method,
      });

      return { verified: true, method: result.method, profile };
    } catch (err) {
      if (err instanceof Error && err.message === 'cedula_taken') {
        return { verified: false, reason: 'Esta cédula ya está registrada en otra cuenta.' };
      }
      if (err instanceof Error && err.message === 'cedula_already_bound') {
        return { verified: false, reason: 'Esta cuenta ya tiene una cédula vinculada.' };
      }
      throw err;
    }
  };
}
