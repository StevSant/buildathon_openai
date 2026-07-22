"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Category, IncidentStatus } from "@pulso/core";
import {
  config,
  getIncidentDetails,
  type AssistantIncidentDetails,
  type AssistantLocation,
} from "@/lib";
import Icon from "./Icon";
import AssistantIncidentDetailMap from "./AssistantIncidentDetailMap";
import IncidentDetailSheet from "./IncidentDetailSheet";

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

// Rich detail card the voice conversation shows when Cerca calls get_incident_details: an
// interactive map at the reported coordinates, the report photo, the key case metadata and
// description, and an action to open the full case detail (issue #4). The speak-ready tool
// envelope omits coordinates, so they are fetched through the same public incident RPC the
// rest of the app uses; every optional piece (map, photo, description) degrades gracefully.
export default function AssistantIncidentDetailCard({
  details,
  location = null,
  showMap = true,
}: {
  details: AssistantIncidentDetails;
  /** Viewer location, forwarded to the full-detail sheet to show distance. */
  location?: AssistantLocation | null;
  /** Suppressed inside the collapsed history so old exchanges do not mount maps. */
  showMap?: boolean;
}) {
  const [coordinates, setCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!showMap) return;
    let active = true;
    void getIncidentDetails(details.id)
      .then((incident) => {
        if (!active || !incident) return;
        if (Number.isFinite(incident.lat) && Number.isFinite(incident.lng)) {
          setCoordinates({ lat: incident.lat, lng: incident.lng });
        }
      })
      .catch(() => {
        // Coordinates are optional: the card simply renders without the map.
      });
    return () => {
      active = false;
    };
  }, [details.id, showMap]);

  const status = STATUS_CHIP[details.status];
  const photoUrl = details.photo_path
    ? `${config.photosBaseUrl}/${details.photo_path}`
    : null;

  return (
    <div className="icard" aria-label={`Detalle del incidente: ${details.title}`}>
      {showMap && coordinates ? (
        <AssistantIncidentDetailMap
          category={details.category}
          latitude={coordinates.lat}
          longitude={coordinates.lng}
          title={details.title}
        />
      ) : null}
      {photoUrl ? (
        <div className="ph">
          <Image
            src={photoUrl}
            alt={`Foto del reporte: ${details.title}`}
            fill
            sizes="(max-width: 480px) calc(100vw - 60px), 420px"
          />
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
          {details.description ? (
            <p className="desc">{details.description}</p>
          ) : null}
          <button
            type="button"
            className="det-link"
            onClick={() => setDetailOpen(true)}
          >
            Ver detalle completo
            <Icon name="ic-chevron" style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {detailOpen ? (
        <IncidentDetailSheet
          incidentId={details.id}
          onClose={() => setDetailOpen(false)}
          viewer={location}
        />
      ) : null}
    </div>
  );
}
