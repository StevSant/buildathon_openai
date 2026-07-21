import {
  AlgorithmicVerifier,
  RegistryApiVerifier,
  CompositeVerifier,
  SupabaseProfileRepository,
} from "@pulso/adapters";
import { makeVerifyIdentity } from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { userFromJwt } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/service-client.ts";

// Composition root: authorize → build the verifier + profile repo → run makeVerifyIdentity.
// Registry provider (if configured) with the algorithmic module-10 as the fallback. The
// profile repo hashes the cédula with the pepper (HMAC); the raw cédula is never persisted.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    const userId = await userFromJwt(req);
    const { cedula } = await req.json();

    const algorithmic = new AlgorithmicVerifier();
    const verifier = env.identityVerifyApiUrl
      ? new CompositeVerifier(
          new RegistryApiVerifier({
            apiUrl: env.identityVerifyApiUrl,
            apiKey: env.identityVerifyApiKey ?? "",
          }),
          algorithmic,
        )
      : algorithmic;

    if (!env.cedulaHashPepper) {
      throw new Error("CEDULA_HASH_PEPPER no configurado");
    }
    const profiles = new SupabaseProfileRepository(createServiceClient(), {
      cedulaHashPepper: env.cedulaHashPepper,
    });

    const verifyIdentity = makeVerifyIdentity({ verifier, profiles });
    const result = await verifyIdentity({ userId, cedula });

    if (!result.verified) {
      return Response.json(
        { error: result.reason ?? "Cédula inválida" },
        { status: 422, headers: corsHeaders },
      );
    }

    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    // CONTRACT §4: non-2xx responses always use the { error } envelope.
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
