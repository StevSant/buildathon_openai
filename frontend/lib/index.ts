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
export { haversineMeters } from "./distance";
export { REALTIME_TOOLS } from "./realtime-tools";
export { TOOL_CALL_LABELS } from "./tool-labels";
export { compressImage } from "./compress-image";
export { decideAlertTier, subscribeToNotificationIncidents } from "./notifications";
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
