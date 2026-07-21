import type { RealtimeChannel } from "@supabase/supabase-js";
import { clampSeverity } from "@pulso/core";
import type {
  Category,
  ConfirmationKind,
  IncidentDetails,
  IncidentStatus,
  NearbyIncident,
} from "@pulso/core";
import { supabase } from "./supabase";
import { config } from "./config";

// Thin data clients (no hexagon inside React). They call the same PostGIS RPCs the
// agent-tools function uses, and cast the snake_case RPC rows into the snake_case
// @pulso/core DTOs the UI consumes (mirroring the SupabaseIncidentRepository adapter).

// Fetch active incidents near a point via the get_nearby_incidents RPC.
export async function getNearbyIncidents(params: {
  lat: number;
  long: number;
  radiusMeters?: number;
  category?: Category | null;
}): Promise<NearbyIncident[]> {
  const { data, error } = await supabase.rpc("get_nearby_incidents", {
    user_lat: params.lat,
    user_long: params.long,
    radius_meters: params.radiusMeters ?? config.defaultRadiusMeters,
    filter_category: params.category ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: row.category as Category,
    severity: clampSeverity(row.severity as number),
    status: row.status as IncidentStatus,
    distance_meters: row.distance_meters as number,
    confirmations: row.confirmations as number,
    created_at: row.created_at as string,
    lng: row.lng as number,
    lat: row.lat as number,
  }));
}

// One incident's public detail (no reporter PII beyond display_name).
export async function getIncidentDetails(
  incidentId: string,
): Promise<IncidentDetails | null> {
  const { data, error } = await supabase.rpc("get_incident_details", {
    target_id: incidentId,
  });
  if (error) throw error;

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: row.category as Category,
    severity: clampSeverity(row.severity as number),
    status: row.status as IncidentStatus,
    confirmations: row.confirmations as number,
    reporter_name: (row.reporter_name as string | null) ?? null,
    reporter_verified: Boolean(row.reporter_verified),
    created_at: row.created_at as string,
    lng: row.lng as number,
    lat: row.lat as number,
  };
}

// Register a confirm/dispute vote. user_id is derived server-side from the JWT (the RPC is
// security invoker); it is never trusted from the client.
export async function confirmIncident(
  incidentId: string,
  kind: ConfirmationKind,
): Promise<{ id: string; confirmations: number; status: IncidentStatus }> {
  const { data, error } = await supabase.rpc("confirm_incident", {
    target_id: incidentId,
    kind,
  });
  if (error) throw error;

  const row = ((data ?? [])[0] ?? {}) as Record<string, unknown>;
  return {
    id: (row.id as string) ?? incidentId,
    confirmations: (row.confirmations as number) ?? 0,
    status: row.status as IncidentStatus,
  };
}

// Subscribe to every insert/update/delete on incidents. Postgres Changes is the fastest
// path for the MVP; the callback typically re-runs getNearbyIncidents to refresh the map.
export function subscribeToIncidents(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("incidents-map")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "incidents" },
      () => onChange(),
    )
    .subscribe();
}
