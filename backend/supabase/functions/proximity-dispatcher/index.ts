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
  try {
    const env = getEnv();
    if (!env.hermesApiUrl || !env.hermesApiKey || !env.hermesFrom) {
      throw new Error("HERMES_* no configurado");
    }

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

    const body = await req.json().catch(() => ({}));

    let result: { sent: number };
    if (body.type === "sos") {
      // Manual SOS (CONTRACT §4: { type: 'sos', location: { lat, lng } }): identify the
      // owner from their JWT (this function has verify_jwt = false, so the app still
      // sends the Authorization header for SOS calls).
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      result = await dispatch({
        kind: "sos",
        userId: ownerId,
        template: env.whatsappSosTemplate,
        params: body.location,
      });
    } else {
      // Incident insert: a Supabase DB webhook sends { record: { id } }; a manual/trigger
      // call may send { incidentId }.
      const incidentId = body.incidentId ?? body.record?.id;
      if (!incidentId) throw new Error("incidentId requerido");
      result = await dispatch({
        kind: "proximity",
        incidentId,
        template: env.whatsappProximityTemplate,
      });
    }

    // CONTRACT §4: the function responds { dispatched: number }.
    return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
  } catch (err) {
    // CONTRACT §4: non-2xx responses always use the { error } envelope.
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
