import { OpenAIRealtimeSessionFactory } from "@pulso/adapters";
import { makeCreateAgentSession } from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { userFromJwt } from "../_shared/auth.ts";
import { PERSONAS, DEFAULT_PERSONA_ID } from "./personas.ts";

// Composition root: authorize → inject the persona map (instructions + tool contracts) into
// the session factory → mint an ephemeral OpenAI Realtime client secret. The browser then
// opens WebRTC directly with that secret; audio never passes through our servers.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    await userFromJwt(req); // authorize the caller (session is per-user)
    if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY no configurado");

    const body = await req.json().catch(() => ({}));
    const personaId =
      typeof body.personaId === "string" && body.personaId in PERSONAS
        ? body.personaId
        : DEFAULT_PERSONA_ID;

    // Personas (instructions + tools) are injected into the factory constructor; the
    // factory validates personaId against this map and never accepts a raw prompt.
    const sessions = new OpenAIRealtimeSessionFactory({
      apiKey: env.openaiApiKey,
      model: env.openaiRealtimeModel,
      voice: env.openaiRealtimeVoice,
      personas: PERSONAS,
      apiBaseUrl: env.openaiBaseUrl,
      transcriptionModel: env.openaiTranscribeModel,
    });

    const createAgentSession = makeCreateAgentSession({ sessions });
    const result = await createAgentSession({
      personaId,
      context: typeof body.context === "object" && body.context ? body.context : undefined,
    });

    // The factory returns { clientSecret, expiresAt }; the client also needs the model id
    // to open the WebRTC connection, and CONTRACT §4 includes the configured voice.
    return Response.json(
      { ...result, model: env.openaiRealtimeModel, voice: env.openaiRealtimeVoice },
      { headers: corsHeaders },
    );
  } catch (err) {
    // CONTRACT §4: non-2xx responses always use the { error } envelope.
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
