import { createUserClient } from "./supabase-client.ts";

// Derive the authenticated user's id from the request JWT. Throws "unauthorized" when the
// token is missing or invalid. Edge functions never trust a user_id supplied in the body —
// they call this instead (see ARCHITECTURE §5, the security model).
export async function userFromJwt(req: Request): Promise<string> {
  const supabase = createUserClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("unauthorized");
  return data.user.id;
}
