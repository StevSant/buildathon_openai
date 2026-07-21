import { SupabaseIncidentRepository } from "@pulso/adapters";
import {
  makeGetNearbyIncidents,
  makeGetIncidentDetails,
  makeConfirmIncident,
} from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { userFromJwt } from "../_shared/auth.ts";
import { createUserClient } from "../_shared/supabase-client.ts";

// The tool implementation the browser bridge calls (OpenAI never calls Supabase directly).
// Router over the three agent tools. Runs with a USER-scoped client so the security-invoker
// RPCs resolve auth.uid() to the real caller — a user_id in the body is never trusted.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    const userId = await userFromJwt(req);
    // Env-injected bounds: MAX_RADIUS_METERS caps whatever radius the model asks for,
    // and the confirm/dispute thresholds ride along to the confirm_incident RPC.
    const incidents = new SupabaseIncidentRepository(createUserClient(req), {
      maxRadiusMeters: env.maxRadiusMeters,
      confirmThreshold: env.confirmThreshold,
      disputeThreshold: env.disputeThreshold,
    });
    const { tool, arguments: args = {} } = await req.json();

    let result: unknown;
    switch (tool) {
      case "get_nearby_incidents": {
        const run = makeGetNearbyIncidents({ incidents });
        result = await run({
          lat: args.user_lat,
          long: args.user_long,
          radiusMeters: args.radius_meters ?? env.defaultRadiusMeters,
          category: args.filter_category ?? null,
        });
        break;
      }
      case "get_incident_details": {
        const run = makeGetIncidentDetails({ incidents });
        result = await run({ incidentId: args.incident_id });
        break;
      }
      case "confirm_incident": {
        const run = makeConfirmIncident({ incidents });
        result = await run({
          userId,
          incidentId: args.incident_id,
          kind: args.kind === "dispute" ? "dispute" : "confirm",
        });
        break;
      }
      default:
        return Response.json(
          { error: `unknown tool: ${tool}` },
          { status: 400, headers: corsHeaders },
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
