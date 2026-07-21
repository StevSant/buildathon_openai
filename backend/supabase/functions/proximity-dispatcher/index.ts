import {
  HermesWhatsAppGateway,
  SupabaseIncidentRepository,
  SupabaseProfileRepository,
} from "@pulso/adapters";
import { makeDispatchProximityAlerts } from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { createServiceClient } from "../_shared/service-client.ts";
import { createUserClient } from "../_shared/supabase-client.ts";
import { hasValidWebhookSecret } from "../_shared/webhook-auth.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Composition root for proximity alerts. Two entry points:
//   1. incident insert (DB trigger / Supabase webhook) → alert nearby users' contacts
//      (matched via the get_alert_matches RPC in migration 0002)
//   2. manual SOS from the app → alert the caller's own accepted contacts immediately
// Sends run through the MessagingGateway port → HermesWhatsAppGateway adapter. Uses the
// service role because it reads/writes across users.
//
// TODO (deploy): wire the incident-insert trigger/webhook from migration 0002 to POST here.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json(
      { error: "method not allowed" },
      { status: 405, headers: { ...corsHeaders, Allow: "POST, OPTIONS" } },
    );
  }

  try {
    const env = getEnv();
    const body = await req.json();

    let input:
      | { kind: "sos"; userId: string; template: string; params: Record<string, unknown> }
      | { kind: "proximity"; incidentId: string; template: string };
    if (body.type === "sos") {
      // Manual SOS (CONTRACT §4: { type: 'sos', location: { lat, lng } }): identify the
      // owner from their JWT (this function has verify_jwt = false, so the app still
      // sends the Authorization header for SOS calls).
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      input = {
        kind: "sos",
        userId: ownerId,
        template: env.whatsappSosTemplate,
        params: body.location,
      };
    } else {
      if (!env.proximityWebhookSecret) {
        throw new Error("configuration error: PROXIMITY_WEBHOOK_SECRET no configurado");
      }
      if (!hasValidWebhookSecret(req, env.proximityWebhookSecret)) {
        return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
      }

      // Incident insert: a Supabase DB webhook sends { record: { id } }; a manual/trigger
      // call may send { incidentId }.
      const incidentId = body.incidentId ?? body.record?.id;
      if (!incidentId) throw new Error("incidentId requerido");
      if (typeof incidentId !== "string" || !UUID_PATTERN.test(incidentId)) {
        throw new Error("incidentId inválido");
      }
      input = {
        kind: "proximity",
        incidentId,
        template: env.whatsappProximityTemplate,
      };
    }

    if (!env.hermesApiUrl || !env.hermesApiKey || !env.hermesFrom) {
      throw new Error("configuration error: HERMES_* no configurado");
    }

    // Privileged dependencies are created only after the caller path is authenticated.
    const service = createServiceClient();
    const messaging = new HermesWhatsAppGateway({
      apiUrl: env.hermesApiUrl,
      apiKey: env.hermesApiKey,
      from: env.hermesFrom,
    });
    const incidents = new SupabaseIncidentRepository(service);
    const profiles = new SupabaseProfileRepository(service, {
      cedulaHashPepper: env.cedulaHashPepper ?? "",
    });
    const dispatch = makeDispatchProximityAlerts({ incidents, profiles, messaging });
    const result = await dispatch(input);

    // CONTRACT §4: the function responds { dispatched: number }.
    return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
  } catch (err) {
    // CONTRACT §4: non-2xx responses always use the { error } envelope.
    const message = err instanceof Error ? err.message : "error";
    const status =
      message === "unauthorized" ? 401 : message.startsWith("configuration error:") ? 500 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
