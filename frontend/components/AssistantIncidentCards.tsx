"use client";

import type { Category, IncidentStatus, NearbyIncident } from "@pulso/core";
import Icon from "./Icon";

const CATEGORY_ICON: Record<Category, string> = {
  road_closure: "ic-road",
  accident: "ic-car",
  flood: "ic-water",
  fire: "ic-fire",
  public_event: "ic-spark",
  other: "ic-alert",
};

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

const CATEGORY_SEV_CLASS: Record<Category, string> = {
  road_closure: "sev-road",
  accident: "sev-acc",
  flood: "sev-flood",
  fire: "sev-fire",
  public_event: "sev-evt",
  other: "sev-acc",
};

const STATUS_CHIP: Record<IncidentStatus, { className: string; label: string }> = {
  provisional: { className: "st-prov", label: "provisional" },
  confirmed: { className: "st-conf", label: "confirmado" },
  disputed: { className: "st-prov", label: "en disputa" },
  resolved: { className: "st-conf", label: "resuelto" },
};

const MAX_CARDS = 3;

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatRelativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

// Rich card list the voice conversation shows when Cerca calls get_nearby_incidents:
// the same evidence the agent cites out loud (distance, recency, status, confirmations).
export default function AssistantIncidentCards({
  incidents,
}: {
  incidents: NearbyIncident[];
}) {
  if (incidents.length === 0) return null;

  const visible = incidents.slice(0, MAX_CARDS);
  const hidden = incidents.length - visible.length;

  return (
    <div className="icard" aria-label="Incidentes cercanos encontrados">
      {visible.map((incident) => {
        const status = STATUS_CHIP[incident.status];
        return (
          <div
            key={incident.id}
            className={`inc ${CATEGORY_SEV_CLASS[incident.category]}`}
          >
            <span className="ic">
              <Icon
                name={CATEGORY_ICON[incident.category]}
                style={{ color: CATEGORY_COLOR[incident.category] }}
              />
            </span>
            <div className="body">
              <div className="title">{incident.title}</div>
              <div className="meta">
                <span className="mono">a {formatDistance(incident.distance_meters)}</span>
                <span className="mono">{formatRelativeTime(incident.created_at)}</span>
                <span className={`status ${status.className}`}>{status.label}</span>
                <span className="mono">✓ {incident.confirmations}</span>
              </div>
            </div>
          </div>
        );
      })}
      {hidden > 0 ? <div className="more">+{hidden} más en el mapa</div> : null}
    </div>
  );
}
