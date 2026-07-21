import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

// Browser Supabase client (anon key + the signed-in user's JWT from the auth session).
// RLS is the real access boundary; this client only ever sees rows the user may see.
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
