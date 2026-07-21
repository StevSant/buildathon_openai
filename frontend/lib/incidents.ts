import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Category,
  ConfirmationKind,
  IncidentDetails,
  IncidentStatus,
  NearbyIncident,
} from "@pulso/core";
import { config } from "./config";
import { supabase } from "./supabase";

// Thin client for the incident RPCs. The SQL DTOs use the same snake_case fields as
// the public domain types, including lng/lat, so no client-side reshaping is needed.

// Fetch the active incidents around a location.
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
  return (data ?? []) as NearbyIncident[];
}

// Fetch one anonymous incident detail. Supabase returns table RPC results as an array.
export async function getIncidentDetails(
  incidentId: string,
): Promise<IncidentDetails | null> {
  const { data, error } = await supabase.rpc("get_incident_details", {
    target_id: incidentId,
  });

  if (error) throw error;
  const rows = (data ?? []) as IncidentDetails[];
  return rows[0] ?? null;
}

// Register a confirmation or dispute. The authenticated user is derived by the RPC.
export async function confirmIncident(
  incidentId: string,
  kind: ConfirmationKind,
): Promise<{ id: string; confirmations: number; status: IncidentStatus }> {
  const { data, error } = await supabase.rpc("confirm_incident", {
    target_id: incidentId,
    kind,
  });

  if (error) throw error;
  const row = ((Array.isArray(data) ? data[0] : data) ?? {}) as {
    id?: string;
    confirmations?: number;
    status?: IncidentStatus;
  };

  return {
    id: row.id ?? incidentId,
    confirmations: row.confirmations ?? 0,
    status: row.status ?? "provisional",
  };
}

// The map owns this Realtime channel; notifications subscribe on a separate channel.
export function subscribeToIncidents(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("incidents-map")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "incidents" },
      onChange,
    )
    .subscribe();
}
