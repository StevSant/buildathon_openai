"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Category, IncidentDetails, IncidentStatus } from "@pulso/core";
import { IncidentComments } from "@/components";
import { config, confirmIncident, getIncidentDetails, haversineMeters } from "@/lib";
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

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatVotes(confirmations: number, disputes: number): string {
  if (confirmations === 0 && disputes === 0) return "Sé el primero en confirmarlo";
  const confirmed = `${confirmations} ${confirmations === 1 ? "confirmó" : "confirmaron"}`;
  if (disputes === 0) return confirmed;
  return `${confirmed} · ${disputes} ${disputes === 1 ? "lo disputó" : "lo disputaron"}`;
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

// Detail sheet for one anonymous public incident. The API intentionally exposes only the
// reporter_verified flag, never a reporter name, identity document, or contact data.
export default function IncidentDetailSheet({
  incidentId,
  onClose,
  viewer,
}: {
  incidentId: string;
  onClose: () => void;
  /** Viewer location used to derive the "a 340 m" distance; omit to hide it. */
  viewer?: { lat: number; long: number } | null;
}) {
  const [details, setDetails] = useState<IncidentDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetails(null);
    setHasError(false);

    void getIncidentDetails(incidentId)
      .then((incident) => {
        if (active) setDetails(incident);
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [incidentId]);

  async function vote(kind: "confirm" | "dispute") {
    setBusy(true);
    setVoteError(null);
    try {
      await confirmIncident(incidentId, kind);
      onClose();
    } catch (reason) {
      const code = (reason as { code?: string })?.code;
      const message = reason instanceof Error ? reason.message : "";
      setVoteError(
        code === "42501" || /row-level security/i.test(message)
          ? "Tu cuenta está deshabilitada por reportes falsos; no puedes votar."
          : "No pudimos registrar tu voto. Intenta de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  const color = details ? CATEGORY_COLOR[details.category] : "var(--accent)";
  const status = details ? STATUS_CHIP[details.status] : null;
  const photoUrl = details?.photo_path
    ? `${config.photosBaseUrl}/${details.photo_path}`
    : null;
  const distanceMeters =
    details && viewer
      ? haversineMeters(viewer.lat, viewer.long, details.lat, details.lng)
      : null;
  const confirmations = details?.confirmations ?? 0;
  const disputes = details?.disputes ?? 0;
  const stackOverflow = Math.max(0, confirmations - 2);

  return (
    <section
      className="s-det"
      aria-label="Detalle del incidente"
      style={{ position: "absolute", inset: 0, zIndex: 30, background: "var(--bg)" }}
    >
      <div className="det-scroll">
        <div className="det-head">
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar detalle">
            <Icon name="ic-back" />
          </button>
          <span className="t">Incidente</span>
        </div>

        <div className="det-photo">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt="Foto del incidente"
              fill
              sizes="(max-width: 480px) calc(100vw - 28px), 452px"
            />
          ) : (
            <div className="grain" />
          )}
          {details ? (
            <div className="ov">
              <span className="chip sev" style={{ background: color }}>
                <Icon name={CATEGORY_ICON[details.category]} />
                {CATEGORY_LABEL[details.category]}
              </span>
              <span className="chip">Severidad {details.severity}</span>
            </div>
          ) : null}
        </div>

        <div className="det-body">
          {hasError && !details ? (
            <p
              className="det-desc"
              style={{ color: "var(--sev-fire)" }}
              role="alert"
            >
              No se pudo cargar este incidente. Intenta nuevamente.
            </p>
          ) : (
            <>
              <div className="det-title">{details?.title ?? "Cargando incidente…"}</div>

              {details ? (
                <div className="det-meta">
                  {distanceMeters !== null ? (
                    <span className="mono">a {formatDistance(distanceMeters)}</span>
                  ) : null}
                  <span className="mono">{formatRelativeTime(details.created_at)}</span>
                  {status ? (
                    <span className={`status ${status.className}`}>{status.label}</span>
                  ) : null}
                </div>
              ) : null}

              {details?.reporter_verified ? (
                <div className="reporter">
                  <span className="av">
                    <Icon name="ic-check" style={{ width: 15, height: 15, strokeWidth: 2.3 }} />
                  </span>
                  <div>
                    <div className="rn">Reporte verificado</div>
                    <div className="rr">Identidad del reportante confirmada</div>
                  </div>
                  <span className="badge-ok" style={{ marginLeft: "auto" }}>
                    <Icon name="ic-check" style={{ width: 15, height: 15, strokeWidth: 2.3 }} />
                  </span>
                </div>
              ) : null}

              <div className="det-desc">{details?.description ?? "Cargando detalle…"}</div>

              {details ? (
                <div className="confbar">
                  {confirmations > 0 ? (
                    <span className="stack" aria-hidden="true">
                      {Array.from({ length: Math.min(confirmations, 2) }, (_, index) => (
                        <span key={index}>✓</span>
                      ))}
                      {stackOverflow > 0 ? <span>+{stackOverflow}</span> : null}
                    </span>
                  ) : null}
                  {formatVotes(confirmations, disputes)}
                </div>
              ) : null}

              {voteError && (
                <p aria-live="polite" className="det-desc" style={{ color: "var(--sev-fire)" }}>
                  {voteError}
                </p>
              )}

              {details && <IncidentComments incidentId={incidentId} />}
            </>
          )}
        </div>
      </div>

      <p className="helper">¿Lo estás viendo? Ayuda a la comunidad a verificarlo.</p>

      <div className="det-actions">
        <button
          type="button"
          className="btn confirm"
          disabled={busy || !details}
          onClick={() => vote("confirm")}
        >
          <Icon name="ic-check" style={{ width: 17, height: 17, strokeWidth: 2.4 }} />
          Confirmar
        </button>
        <button
          type="button"
          className="btn dispute"
          style={{ maxWidth: 120 }}
          disabled={busy || !details}
          onClick={() => vote("dispute")}
        >
          No es correcto
        </button>
      </div>
    </section>
  );
}
