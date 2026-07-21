import type { IdentityVerifier, ProfileRepository } from '../ports';

/**
 * Verify a cédula and, when valid, create the caller's verified profile. The raw
 * cédula is passed straight to the repository (which hashes it); it is never stored
 * by this use-case.
 */
export function makeVerifyIdentity({
  verifier,
  profiles,
}: {
  verifier: IdentityVerifier;
  profiles: ProfileRepository;
}) {
  return async (input: { userId: string; cedula: string }) => {
    const result = await verifier.verify(input.cedula);
    if (!result.valid) {
      return { verified: false as const, reason: result.reason };
    }

    const profile = await profiles.createVerified({
      userId: input.userId,
      cedula: input.cedula,
      method: result.method,
    });

    return { verified: true as const, method: result.method, profile };
  };
}
