import type { VerificationMethod } from './verification-method';

/**
 * A user's public profile and trust state. The raw cédula and its hash are
 * infrastructure concerns and deliberately absent from the domain shape.
 */
export interface Profile {
  id: string;
  displayName: string | null;
  verified: boolean;
  verificationMethod: VerificationMethod | null;
  trustScore: number;
  createdAt: string;
}
