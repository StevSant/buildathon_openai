/**
 * Anonymous public comment attached to an incident. Author identity stays private;
 * consumers receive only whether the commenter completed identity verification.
 */
export interface IncidentComment {
  id: string;
  body: string;
  created_at: string;
  author_verified: boolean;
}
