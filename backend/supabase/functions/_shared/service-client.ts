import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env.ts";

// A service-role Supabase client that BYPASSES RLS. Only for trusted server-side work
// (identity upsert, proximity dispatch across users). The service-role key must NEVER reach
// the browser — it lives solely in Edge Function secrets.
export function createServiceClient(): SupabaseClient {
  const env = getEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
