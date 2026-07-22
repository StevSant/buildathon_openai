import {
  HermesWhatsAppGateway,
  SupabaseIncidentRepository,
  SupabaseProfileRepository,
} from "@pulso/adapters";
import {
  evaluateWhatsAppResend,
  makeDispatchProximityAlerts,
  type WhatsAppResendPolicy,
} from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv, type EdgeEnv } from "../_shared/env.ts";
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
      verifyWhatsapp?: boolean;
    };

    const isUserRequest =
      Boolean(body.optin?.contactId) || body.type === "sos" || body.verifyWhatsapp === true;
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

    // Self opt-in: confirm/resend the user's OWN WhatsApp number (whatsapp_config), not an
    // emergency contact. Server-side rate-limited to curb abuse and messaging cost (issue #6).
    if (body.verifyWhatsapp) {
      return await sendWhatsAppVerification(service, messaging, env, ownerId!);
    }

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

// Send (or resend) the user's own-number WhatsApp confirmation, gated by a server-side rate
// limit. The pure `evaluateWhatsAppResend` rule decides; this function only loads/persists the
// per-user counters and performs the delivery. No verification code or phone number is ever
// logged — only the user id, the tripped guard, and the delivery status, for diagnostics.
async function sendWhatsAppVerification(
  service: ReturnType<typeof createServiceClient>,
  messaging: HermesWhatsAppGateway,
  env: EdgeEnv,
  ownerId: string,
): Promise<Response> {
  const { data: cfg, error: cfgError } = await service
    .from("whatsapp_config")
    .select("phone_e164")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (cfgError) throw new Error(cfgError.message);
  if (!cfg?.phone_e164) throw new Error("no hay número de WhatsApp configurado");

  const { data: attempt, error: attemptError } = await service
    .from("whatsapp_verification_attempts")
    .select("window_started_at, send_count, last_sent_at, success_count, fail_count")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (attemptError) throw new Error(attemptError.message);

  const policy: WhatsAppResendPolicy = {
    cooldownSeconds: env.whatsappResendCooldownSeconds,
    windowSeconds: env.whatsappResendWindowSeconds,
    maxSendsPerWindow: env.whatsappResendMaxPerWindow,
  };
  const nowMs = Date.now();
  const decision = evaluateWhatsAppResend(
    {
      windowStartedAt: attempt?.window_started_at ? Date.parse(attempt.window_started_at) : null,
      sendCount: attempt?.send_count ?? 0,
      lastSentAt: attempt?.last_sent_at ? Date.parse(attempt.last_sent_at) : null,
    },
    policy,
    nowMs,
  );

  if (!decision.allowed) {
    console.warn(
      JSON.stringify({
        event: "whatsapp_verification_rate_limited",
        userId: ownerId,
        retryAfterSeconds: decision.retryAfterSeconds,
      }),
    );
    return Response.json(
      {
        error: "Espera unos segundos antes de solicitar otro código.",
        retryAfterSeconds: decision.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { ...corsHeaders, "Retry-After": String(decision.retryAfterSeconds) },
      },
    );
  }

  // The rate-limit slot is consumed for every real attempt, so delivery failures (a Hermes
  // transport error included) still count against the limit — that is what protects cost.
  let sent = false;
  try {
    const delivery = await messaging.sendWhatsApp({ to: cfg.phone_e164, kind: "optin" });
    sent = delivery.status !== "failed";
  } catch (sendError) {
    console.error(
      JSON.stringify({
        event: "whatsapp_verification_delivery_error",
        userId: ownerId,
        reason: sendError instanceof Error ? sendError.message : "unknown",
      }),
    );
  }

  const next = decision.nextState;
  const { error: upsertError } = await service.from("whatsapp_verification_attempts").upsert(
    {
      user_id: ownerId,
      window_started_at: new Date(next.windowStartedAt ?? nowMs).toISOString(),
      send_count: next.sendCount,
      last_sent_at: new Date(nowMs).toISOString(),
      last_status: sent ? "sent" : "failed",
      success_count: (attempt?.success_count ?? 0) + (sent ? 1 : 0),
      fail_count: (attempt?.fail_count ?? 0) + (sent ? 0 : 1),
      updated_at: new Date(nowMs).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw new Error(upsertError.message);

  if (sent) {
    // The latest confirmation supersedes any earlier one; mark the number verified (demo path).
    await service.from("whatsapp_config").update({ verified: true }).eq("user_id", ownerId);
    console.info(JSON.stringify({ event: "whatsapp_verification_sent", userId: ownerId }));
  } else {
    console.error(
      JSON.stringify({ event: "whatsapp_verification_delivery_failed", userId: ownerId }),
    );
  }

  return Response.json(
    { dispatched: sent ? 1 : 0, cooldownSeconds: policy.cooldownSeconds },
    { headers: corsHeaders },
  );
}

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
