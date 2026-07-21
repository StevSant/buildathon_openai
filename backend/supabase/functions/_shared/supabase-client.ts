import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env.ts";

// A Supabase client that carries the caller's JWT so RLS and auth.uid() apply to every query
// and RPC. Use this for anything that must run *as the user* — e.g. agent-tools, where the
// security-invoker RPCs derive user_id from auth.uid().
export function createUserClient(req: Request): SupabaseClient {
  const env = getEnv();
  const authorization = req.headers.get("Authorization") ?? "";
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
