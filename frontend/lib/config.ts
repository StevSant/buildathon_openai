// Client configuration. Reads ONLY NEXT_PUBLIC_* variables (safe to ship to the browser).
// Secrets never live here — those stay in Supabase Edge Function secrets.
// Each process.env.NEXT_PUBLIC_* is referenced literally so Next inlines it at build time.

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const supabaseUrl = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const config = {
  supabaseUrl,
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  // Edge Functions live under /functions/v1 of the Supabase project.
  functionsUrl: `${supabaseUrl}/functions/v1`,
  // Public storage base for report photos (bucket is public-read for the demo).
  photosBaseUrl: `${supabaseUrl}/storage/v1/object/public/report-photos`,
  mapStyleUrl: required(
    "NEXT_PUBLIC_MAP_STYLE_URL",
    process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  ),
  // Initial map view — the venue (PUCE Manabí, Portoviejo; keep in sync with
  // backend/supabase/seed.sql and the env examples).
  defaultLat: num(process.env.NEXT_PUBLIC_DEFAULT_LAT, -1.05458),
  defaultLng: num(process.env.NEXT_PUBLIC_DEFAULT_LNG, -80.45445),
  defaultZoom: num(process.env.NEXT_PUBLIC_DEFAULT_ZOOM, 14),
  // Venue labels for the map header (sector + city).
  venueName: process.env.NEXT_PUBLIC_VENUE_NAME ?? "Cdla. Primero de Mayo",
  venueCity: process.env.NEXT_PUBLIC_VENUE_CITY ?? "Portoviejo",
  // OpenAI Realtime WebRTC endpoint for the SDP handshake (the ephemeral client
  // secret authorizes it); overridable for proxies.
  openaiRealtimeUrl:
    process.env.NEXT_PUBLIC_OPENAI_REALTIME_URL ??
    "https://api.openai.com/v1/realtime/calls",
  // Map / agent search radius.
  defaultRadiusMeters: num(process.env.NEXT_PUBLIC_DEFAULT_RADIUS_METERS, 3000),
  // Proximity-alert thresholds: a nearby incident escalates to a bottom sheet only when it
  // is at least this severe AND closer than this radius. Otherwise it is a discreet toast.
  alertMinSeverity: num(process.env.NEXT_PUBLIC_ALERT_SEVERITY_MIN, 4),
  alertRadiusMeters: num(process.env.NEXT_PUBLIC_ALERT_RADIUS_METERS, 500),
  // Report-photo client-side re-encode bounds (longest side in px, JPEG quality 0-1).
  photoMaxDimension: num(process.env.NEXT_PUBLIC_PHOTO_MAX_DIMENSION, 1600),
  photoJpegQuality: num(process.env.NEXT_PUBLIC_PHOTO_JPEG_QUALITY, 0.85),
} as const;

export type AppConfig = typeof config;
