// Barrel for the thin data/HTTP client layer. Consumers import from "@/lib", never from
// the individual files.
export { config } from "./config";
export type { AppConfig } from "./config";
export { supabase } from "./supabase";
export {
  getNearbyIncidents,
  getIncidentDetails,
  confirmIncident,
  subscribeToIncidents,
} from "./incidents";
export { REALTIME_TOOLS } from "./realtime-tools";
export { decideAlertTier } from "./notifications";
export type { AlertTier } from "./notifications";
export { startRealtimeSession } from "./realtime-agent";
export { readVerifiedIdentityResponse } from "./identity-verification";
export { authDestination } from "./auth-state";
export type { AuthSessionLike } from "./auth-state";
export type {
  AssistantHandle,
  AssistantStatus,
  AssistantCallbacks,
} from "./realtime-agent";
