import {
  CATEGORY_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@pulso/core";
import type { IncidentDetails } from "@pulso/core";
import { formatTimeAgo } from "./format-time-ago.ts";
import { minutesSince } from "./minutes-since.ts";

// Presentation layer for get_incident_details: speak-ready Spanish labels, an explicit
// found flag (instead of a bare null), and no exact coordinates or storage paths — the
// agent only needs to know whether a photo exists, the app renders it.
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
      created_at: details.created_at,
      reported_minutes_ago: minutesSince(details.created_at),
      reported_label: formatTimeAgo(details.created_at),
    },
  };
}
