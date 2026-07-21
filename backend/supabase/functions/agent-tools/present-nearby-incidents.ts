import {
  CATEGORY_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@pulso/core";
import type { NearbyIncident } from "@pulso/core";
import { formatDistance } from "./format-distance.ts";
import { formatTimeAgo } from "./format-time-ago.ts";
import { minutesSince } from "./minutes-since.ts";

// Presentation layer for get_nearby_incidents: the model receives speak-ready Spanish
// labels (distance, age, category, status, severity) plus a one-line summary, sorted by
// proximity. Exact coordinates are deliberately excluded — the agent must never read
// them aloud, so it never gets them.
export function presentNearbyIncidents(rows: NearbyIncident[], radiusMeters: number) {
  const sorted = [...rows].sort((a, b) => a.distance_meters - b.distance_meters);
  const km = radiusMeters / 1000;
  const radiusLabel =
    radiusMeters >= 1000
      ? `${(Math.round(km * 10) / 10).toString().replace(".", ",")} km`
      : `${Math.round(radiusMeters)} metros`;

  const incidents = sorted.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    category_label: CATEGORY_LABELS[row.category],
    severity: row.severity,
    severity_label: `${SEVERITY_LABELS[row.severity]} (${row.severity} de 5)`,
    status: row.status,
    status_label: INCIDENT_STATUS_LABELS[row.status],
    confirmations: row.confirmations,
    distance_meters: Math.round(row.distance_meters),
    distance_label: formatDistance(row.distance_meters),
    created_at: row.created_at,
    reported_minutes_ago: minutesSince(row.created_at),
    reported_label: formatTimeAgo(row.created_at),
  }));

  const summary =
    incidents.length === 0
      ? `No hay incidentes activos en un radio de ${radiusLabel}.`
      : `${incidents.length} ${incidents.length === 1 ? "incidente activo" : "incidentes activos"} en un radio de ${radiusLabel}. El más cercano: «${incidents[0].title}» ${incidents[0].distance_label}.`;

  return { total: incidents.length, radius_label: radiusLabel, summary, incidents };
}
