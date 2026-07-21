import { config } from "./config";

// Where a nearby-incident notification should surface. Every incident always lands in the
// notification center; this decides the *transient* surface on top of that:
//   - "sheet"  → an inDrive-style bottom sheet (severe AND close: needs attention now)
//   - "toast"  → a discreet toast (relevant, but not urgent)
// Thresholds come from config (env), never hardcoded.
export type AlertTier = "sheet" | "toast";

export function decideAlertTier(params: {
  severity: number;
  distanceMeters: number;
}): AlertTier {
  const isSevere = params.severity >= config.alertMinSeverity;
  const isClose = params.distanceMeters < config.alertRadiusMeters;
  return isSevere && isClose ? "sheet" : "toast";
}
