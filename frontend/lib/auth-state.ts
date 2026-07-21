export type AuthSessionLike =
  | { user?: { id?: string | null } | null }
  | null
  | undefined;

/** Return the redirect required for protected routes, or null when access is allowed. */
export function authDestination(session: AuthSessionLike): "/auth" | null {
  return session?.user?.id ? null : "/auth";
}
