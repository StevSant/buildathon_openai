// Shared CORS headers for the browser-facing edge functions. The map/report/agent UI calls
// these directly from the phone, so preflight + credentials headers must be permissive.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
