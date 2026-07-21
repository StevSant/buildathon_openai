"use client";

import type { Category, IncidentDetails, IncidentStatus } from "@pulso/core";
import { config } from "@/lib";
import Icon from "./Icon";

const CATEGORY_LABEL: Record<Category, string> = {
  road_closure: "Cierre vial",
  accident: "Accidente",
  flood: "Inundación",
  fire: "Incendio",
  public_event: "Evento público",
  other: "Incidente",
};

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

const CATEGORY_ICON: Record<Category, string> = {
  road_closure: "ic-road",
  accident: "ic-car",
  flood: "ic-water",
  fire: "ic-fire",
  public_event: "ic-spark",
  other: "ic-alert",
};

const STATUS_CHIP: Record<IncidentStatus, { className: string; label: string }> = {
  provisional: { className: "st-prov", label: "provisional" },
  confirmed: { className: "st-conf", label: "confirmado" },
  disputed: { className: "st-prov", label: "en disputa" },
  resolved: { className: "st-conf", label: "resuelto" },
};

function formatRelativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

// Rich detail card the voice conversation shows when Cerca calls get_incident_details:
// the report photo (when one exists) plus the trust evidence behind the spoken answer.
export default function AssistantIncidentDetailCard({
  details,
}: {
  details: IncidentDetails;
}) {
  const status = STATUS_CHIP[details.status];
  const photoUrl = details.photo_path
    ? `${config.photosBaseUrl}/${details.photo_path}`
    : null;

  return (
    <div className="icard" aria-label={`Detalle del incidente: ${details.title}`}>
      {photoUrl ? (
        <div className="ph">
          <img src={photoUrl} alt={`Foto del reporte: ${details.title}`} />
        </div>
      ) : null}
      <div className="inc" style={{ borderLeftColor: CATEGORY_COLOR[details.category] }}>
        <span className="ic">
          <Icon
            name={CATEGORY_ICON[details.category]}
            style={{ color: CATEGORY_COLOR[details.category] }}
          />
        </span>
        <div className="body">
          <div className="title">{details.title}</div>
          <div className="meta">
            <span>{CATEGORY_LABEL[details.category]}</span>
            <span className="mono">{formatRelativeTime(details.created_at)}</span>
            <span className={`status ${status.className}`}>{status.label}</span>
          </div>
          <div className="meta">
            <span className="mono">✓ {details.confirmations} confirmaciones</span>
            {details.disputes > 0 ? (
              <span className="mono">✗ {details.disputes} disputas</span>
            ) : null}
            {details.reporter_verified ? (
              <span className="status st-conf">reporte verificado</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
