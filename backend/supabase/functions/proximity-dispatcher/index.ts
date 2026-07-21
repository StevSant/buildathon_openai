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

// Composition root for proximity alerts, SOS, and emergency-contact opt-in.
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
    const body = (await req.json().catch(() => ({}))) as {
      incidentId?: string;
      record?: { id?: string };
      type?: string;
      location?: { lat?: number; lng?: number };
      optin?: { contactId?: string };
    };

    const isUserRequest = Boolean(body.optin?.contactId) || body.type === "sos";
    let ownerId: string | undefined;
    if (isUserRequest) {
      const { data } = await createUserClient(req).auth.getUser();
      ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
    } else {
      if (!env.proximityWebhookSecret) {
        throw new Error("configuration error: PROXIMITY_WEBHOOK_SECRET no configurado");
      }
      if (!hasValidWebhookSecret(req, env.proximityWebhookSecret)) {
        throw new Error("unauthorized");
      }
    }

    if (!env.hermesWebhookUrl || !env.hermesWebhookSecret) {
      throw new Error("configuration error: HERMES_WEBHOOK_* no configurado");
    }

    // Privileged dependencies are created only after the request path is authenticated.
    const service = createServiceClient();
    const messaging = new HermesWhatsAppGateway({
      webhookUrl: env.hermesWebhookUrl,
      secret: env.hermesWebhookSecret,
    });
    const incidents = new SupabaseIncidentRepository(service);
    const profiles = new SupabaseProfileRepository(service, {
      cedulaHashPepper: env.cedulaHashPepper ?? "",
    });
    const dispatch = makeDispatchProximityAlerts({ incidents, profiles, messaging });

    if (body.optin?.contactId) {
      const { data: contact, error } = await service
        .from("emergency_contacts")
        .select("id, phone_e164")
        .eq("id", body.optin.contactId)
        .eq("owner_id", ownerId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!contact) throw new Error("contacto no encontrado");

      const delivery = await messaging.sendWhatsApp({
        to: contact.phone_e164,
        kind: "optin",
      });
      await logDispatches(service, null, [
        { contactId: contact.id, status: delivery.status },
      ]);
      return Response.json({ dispatched: 1 }, { headers: corsHeaders });
    }

    if (body.type === "sos") {
      if (
        !body.location ||
        !Number.isFinite(body.location.lat) ||
        !Number.isFinite(body.location.lng)
      ) {
        throw new Error("location inválida");
      }
      const result = await dispatch({
        kind: "sos",
        userId: ownerId!,
        // Exact coordinates stay out of the WhatsApp/LLM webhook payload.
      });
      await logDispatches(service, null, result.results);
      return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
    }

    const incidentId = body.incidentId ?? body.record?.id;
    if (!incidentId) throw new Error("incidentId requerido");
    if (!UUID_PATTERN.test(incidentId)) throw new Error("incidentId inválido");

    const result = await dispatch({
      kind: "proximity",
      incidentId,
      context: { incidentId },
    });
    await logDispatches(service, incidentId, result.results);
    return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const status =
      message === "unauthorized" ? 401 : message.startsWith("configuration error:") ? 500 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});

async function logDispatches(
  service: ReturnType<typeof createServiceClient>,
  incidentId: string | null,
  results: Array<{ contactId: string; status: string }>,
): Promise<void> {
  if (results.length === 0) return;
  const rows = results.map((result) => ({
    incident_id: incidentId,
    contact_id: result.contactId,
    status: result.status === "failed" ? "failed" : "sent",
  }));
  const { error } = await service.from("whatsapp_dispatch_log").upsert(rows, {
    onConflict: "incident_id,contact_id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);
}
