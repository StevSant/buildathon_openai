// Barrel for the thin data/HTTP client layer. Consumers import from "@/lib", never from
// the individual files.
export { config } from "./config";
export type { AppConfig } from "./config";
export { supabase } from "./supabase";
export { getSession, onAuthChange, signOut } from "./auth";
export {
  getNearbyIncidents,
  getIncidentDetails,
  confirmIncident,
  subscribeToIncidents,
} from "./incidents";
export { REALTIME_TOOLS } from "./realtime-tools";
export { decideAlertTier, subscribeToNotificationIncidents } from "./notifications";
export type { AlertTier } from "./notifications";
export { startRealtimeSession } from "./realtime-agent";
export type {
  AssistantHandle,
  AssistantStatus,
  AssistantCallbacks,
} from "./realtime-agent";
