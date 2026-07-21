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

// Composition root for proximity alerts, SOS, and emergency-contact opt-in.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    if (!env.hermesWebhookUrl || !env.hermesWebhookSecret || !env.proximityWebhookSecret) {
      throw new Error("HERMES_WEBHOOK_* no configurado");
    }

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

    const body = (await req.json().catch(() => ({}))) as {
      incidentId?: string;
      record?: { id?: string };
      type?: string;
      location?: { lat?: number; lng?: number };
      optin?: { contactId?: string };
    };

    if (body.optin?.contactId) {
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      const { data: contact, error } = await service
        .from("emergency_contacts")
        .select("id, phone_e164")
        .eq("id", body.optin.contactId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!contact) throw new Error("contacto no encontrado");

      const sent = await messaging.sendWhatsApp({ to: contact.phone_e164, kind: "optin" });
      await logDispatches(service, null, [{ contactId: contact.id, status: sent.status }]);
      return Response.json({ dispatched: 1 }, { headers: corsHeaders });
    }

    if (body.type === "sos" && body.location) {
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      const result = await dispatch({
        kind: "sos",
        userId: ownerId,
        // Do not put exact coordinates into a WhatsApp/LLM webhook payload.
      });
      await logDispatches(service, null, result.results);
      return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
    }

    const incidentId = body.incidentId ?? body.record?.id;
    if (!incidentId) throw new Error("incidentId requerido");
    if (req.headers.get("x-pulso-webhook-secret") !== env.proximityWebhookSecret) {
      throw new Error("unauthorized");
    }
    const result = await dispatch({ kind: "proximity", incidentId, context: { incidentId } });
    await logDispatches(service, incidentId, result.results);
    return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
  } catch (err) {
    // CONTRACT §4: non-2xx responses always use the { error } envelope.
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
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
