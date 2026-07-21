// Typed reader for Edge Function secrets. Nothing is hardcoded in the functions — every
// tunable comes from here. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase runtime; the rest are set via `supabase secrets set`.
// Variable names mirror the root .env.example exactly.
// TODO (deploy): set OPENAI_API_KEY, CEDULA_HASH_PEPPER, messaging secrets, and overrides.

function must(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

export function getEnv() {
  return {
    // Supabase runtime (auto-injected)
    supabaseUrl: must("SUPABASE_URL"),
    supabaseAnonKey: must("SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: must("SUPABASE_SERVICE_ROLE_KEY"),

    // OpenAI (server-side only)
    openaiApiKey: optional("OPENAI_API_KEY"),
    openaiBaseUrl: Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
    openaiRealtimeModel: Deno.env.get("OPENAI_REALTIME_MODEL") ?? "gpt-realtime",
    openaiVisionModel: Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-5.6-terra",
    openaiRealtimeVoice: Deno.env.get("OPENAI_REALTIME_VOICE") ?? "marin",
    openaiTranscribeModel: Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-mini-transcribe",

    // Identity verification
    cedulaHashPepper: optional("CEDULA_HASH_PEPPER"),
    identityVerifyApiUrl: optional("IDENTITY_VERIFY_API_URL"),
    identityVerifyApiKey: optional("IDENTITY_VERIFY_API_KEY"),

    // Hermes Agent webhook (outbound WhatsApp alerts)
    hermesWebhookUrl: optional("HERMES_WEBHOOK_URL"),
    hermesWebhookSecret: optional("HERMES_WEBHOOK_SECRET"),
    proximityWebhookSecret: optional("PROXIMITY_WEBHOOK_SECRET"),

    // Query bounds / thresholds / locale
    maxRadiusMeters: Number(Deno.env.get("MAX_RADIUS_METERS") ?? "10000"),
    defaultRadiusMeters: Number(Deno.env.get("DEFAULT_RADIUS_METERS") ?? "3000"),
    incidentTtlHours: Number(Deno.env.get("INCIDENT_TTL_HOURS") ?? "24"),
    confirmThreshold: Number(Deno.env.get("CONFIRM_THRESHOLD") ?? "3"),
    disputeThreshold: Number(Deno.env.get("DISPUTE_THRESHOLD") ?? "3"),
    timezone: Deno.env.get("TIMEZONE") ?? "America/Guayaquil",
    defaultLanguage: Deno.env.get("DEFAULT_LANGUAGE") ?? "es",
  };
}

export type EdgeEnv = ReturnType<typeof getEnv>;
