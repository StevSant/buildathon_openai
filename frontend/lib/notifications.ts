import type { RealtimeChannel } from "@supabase/supabase-js";
import { config } from "./config";
import { supabase } from "./supabase";

// Where a nearby-incident notification should surface. Every incident always lands in the
// notification center; this decides the *transient* surface on top of that:
//   - "sheet"  → an inDrive-style bottom sheet (severe AND close: needs attention now)
//   - "toast"  → a discreet toast (relevant, but not urgent)
// Thresholds come from config (env), never hardcoded.
export type AlertTier = "sheet" | "toast";
type NotificationSurface = "host" | "center";

export function decideAlertTier(params: {
  severity: number;
  distanceMeters: number;
}): AlertTier {
  const isSevere = params.severity >= config.alertMinSeverity;
  const isClose = params.distanceMeters < config.alertRadiusMeters;
  return isSevere && isClose ? "sheet" : "toast";
}

// Notifications deliberately own a channel separate from the map so either surface can
// subscribe and clean up independently (Contract §3.4).
export function subscribeToNotificationIncidents(
  surface: NotificationSurface,
  onChange: () => void,
): RealtimeChannel {
  const channelName = `incidents-notification-${surface}-${crypto.randomUUID()}`;

  return supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "incidents" },
      onChange,
    )
    .subscribe();
}
