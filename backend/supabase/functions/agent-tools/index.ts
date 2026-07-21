import { SupabaseIncidentRepository } from "@pulso/adapters";
import {
  CATEGORY_VALUES,
  makeGetNearbyIncidents,
  makeGetIncidentDetails,
  makeConfirmIncident,
} from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { userFromJwt } from "../_shared/auth.ts";
import { createUserClient } from "../_shared/supabase-client.ts";
import { presentNearbyIncidents } from "./present-nearby-incidents.ts";
import { presentIncidentDetails } from "./present-incident-details.ts";
import { presentConfirmation } from "./present-confirmation.ts";

// The tool implementation the browser bridge calls (OpenAI never calls Supabase directly).
// Router over the three agent tools. Runs with a USER-scoped client so the security-invoker
// RPCs resolve auth.uid() to the real caller — a user_id in the body is never trusted.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    const userId = await userFromJwt(req);
    // MAX_RADIUS_METERS caps whatever radius the model asks for. Confirmation thresholds
    // stay inside Postgres; the frozen confirm_incident RPC accepts only target_id + kind.
    const incidents = new SupabaseIncidentRepository(createUserClient(req), {
      maxRadiusMeters: env.maxRadiusMeters,
    });
    const body: unknown = await req.json();
    const requestBody =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const tool = requestBody.tool;
    const args =
      typeof requestBody.arguments === "object" && requestBody.arguments !== null
        ? (requestBody.arguments as Record<string, unknown>)
        : {};

    let result: unknown;
    switch (tool) {
      case "get_nearby_incidents": {
        if (
          typeof args.user_lat !== "number" ||
          !Number.isFinite(args.user_lat) ||
          typeof args.user_long !== "number" ||
          !Number.isFinite(args.user_long)
        ) {
          return Response.json(
            { error: "user_lat/user_long requeridos" },
            { status: 400, headers: corsHeaders },
          );
        }
        if (
          args.radius_meters !== undefined &&
          (typeof args.radius_meters !== "number" ||
            !Number.isFinite(args.radius_meters) ||
            args.radius_meters <= 0)
        ) {
          return Response.json(
            { error: "radius_meters inválido" },
            { status: 400, headers: corsHeaders },
          );
        }
        const category =
          args.filter_category === undefined || args.filter_category === null
            ? null
            : CATEGORY_VALUES.find((value) => value === args.filter_category);
        if (args.filter_category != null && !category) {
          return Response.json(
            { error: "filter_category inválido" },
            { status: 400, headers: corsHeaders },
          );
        }
        // Effective radius after the MAX_RADIUS_METERS cap (mirrors the repository) so
        // the presenter's summary tells the model the radius that was actually searched.
        const radiusMeters = Math.min(
          typeof args.radius_meters === "number" ? args.radius_meters : env.defaultRadiusMeters,
          env.maxRadiusMeters,
        );
        const run = makeGetNearbyIncidents({ incidents });
        const rows = await run({
          lat: args.user_lat,
          long: args.user_long,
          radiusMeters,
          category,
        });
        result = presentNearbyIncidents(rows, radiusMeters);
        break;
      }
      case "get_incident_details": {
        if (typeof args.incident_id !== "string" || !args.incident_id) {
          return Response.json(
            { error: "incident_id requerido" },
            { status: 400, headers: corsHeaders },
          );
        }
        const run = makeGetIncidentDetails({ incidents });
        result = presentIncidentDetails(await run({ incidentId: args.incident_id }));
        break;
      }
      case "confirm_incident": {
        if (typeof args.incident_id !== "string" || !args.incident_id) {
          return Response.json(
            { error: "incident_id requerido" },
            { status: 400, headers: corsHeaders },
          );
        }
        if (args.kind !== "confirm" && args.kind !== "dispute") {
          return Response.json(
            { error: "kind inválido" },
            { status: 400, headers: corsHeaders },
          );
        }
        const run = makeConfirmIncident({ incidents });
        const outcome = await run({
          userId,
          incidentId: args.incident_id,
          kind: args.kind,
        });
        result = presentConfirmation(outcome, args.kind);
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
