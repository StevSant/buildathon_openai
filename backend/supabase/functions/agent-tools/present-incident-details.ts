import {
  CATEGORY_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@pulso/core";
import type { IncidentDetails } from "@pulso/core";
import { formatTimeAgo } from "./format-time-ago.ts";
import { minutesSince } from "./minutes-since.ts";

// Presentation layer for get_incident_details: speak-ready Spanish labels and an explicit
// found flag (instead of a bare null). No exact coordinates — the agent must never mention
// them. photo_path stays: the assistant UI renders the photo card from this same payload.
export function presentIncidentDetails(details: IncidentDetails | null) {
  if (!details) {
    return {
      found: false,
      summary: "No se encontró ese incidente; puede haber expirado o el id no es válido.",
    };
  }

  return {
    found: true,
    incident: {
      id: details.id,
      title: details.title,
      description: details.description,
      category: details.category,
      category_label: CATEGORY_LABELS[details.category],
      severity: details.severity,
      severity_label: `${SEVERITY_LABELS[details.severity]} (${details.severity} de 5)`,
      status: details.status,
      status_label: INCIDENT_STATUS_LABELS[details.status],
      confirmations: details.confirmations,
      disputes: details.disputes,
      reporter_verified: details.reporter_verified,
      verification_label: details.reporter_verified
        ? "reportado por una persona con identidad verificada"
        : "reportado por una persona sin identidad verificada",
      has_photo: details.photo_path !== null,
      photo_path: details.photo_path,
      created_at: details.created_at,
      reported_minutes_ago: minutesSince(details.created_at),
      reported_label: formatTimeAgo(details.created_at),
    },
  };
}
