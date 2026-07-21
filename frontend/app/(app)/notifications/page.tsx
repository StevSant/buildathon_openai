"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Category, IncidentStatus, NearbyIncident } from "@pulso/core";
import { Icon, IncidentDetailSheet } from "@/components";
import {
  config,
  decideAlertTier,
  getNearbyIncidents,
  supabase,
  subscribeToNotificationIncidents,
} from "@/lib";

// Category → sprite icon + severity color, mirroring the mockup's palette mapping.
const CATEGORY_STYLE: Record<Category, { icon: string; color: string }> = {
  fire: { icon: "ic-fire", color: "var(--sev-fire)" },
  accident: { icon: "ic-car", color: "var(--sev-accident)" },
  flood: { icon: "ic-water", color: "var(--sev-flood)" },
  road_closure: { icon: "ic-road", color: "var(--sev-road)" },
  public_event: { icon: "ic-spark", color: "var(--sev-event)" },
  other: { icon: "ic-alert", color: "var(--sev-event)" },
};

const GROUP_ORDER = ["Ahora", "Hoy", "Anteriores"] as const;
type GroupLabel = (typeof GROUP_ORDER)[number];

function groupLabelFor(createdAt: string): GroupLabel {
  const created = new Date(createdAt);
  const ageMinutes = (Date.now() - created.getTime()) / 60_000;
  if (ageMinutes < 5) return "Ahora";

  const now = new Date();
  const sameDay =
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate();
  return sameDay ? "Hoy" : "Anteriores";
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

function formatAge(createdAt: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000),
  );
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

function statusChip(
  status: IncidentStatus,
): { className: string; label: string } | null {
  if (status === "provisional") return { className: "st-prov", label: "provisional" };
  if (status === "confirmed") return { className: "st-conf", label: "confirmado" };
  return null;
}

// Notification center: incidents remain available here even after a transient sheet or toast
// has been dismissed. Its subscription intentionally uses the notifications-specific channel.
export default function NotificationsPage() {
  const [rows, setRows] = useState<NearbyIncident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const location = useRef({
    lat: config.defaultLat,
    long: config.defaultLng,
  });

  useEffect(() => {
    let active = true;

    async function refresh(): Promise<void> {
      try {
        const data = await getNearbyIncidents(location.current);
        if (active) setRows(data);
      } catch {
        if (active) setRows([]);
      }
    }

    void refresh();
    const channel = subscribeToNotificationIncidents(
      "center",
      () => void refresh(),
    );

    navigator.geolocation?.getCurrentPosition(
      (position) => {
        if (!active) return;
        location.current = {
          lat: position.coords.latitude,
          long: position.coords.longitude,
        };
        void refresh();
      },
      () => undefined,
    );

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: rows.filter((row) => groupLabelFor(row.created_at) === label),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="s-notif" style={{ position: "relative" }}>
      <div className="nhead">
        <span className="t">Notificaciones</span>
      </div>

      <div className="nrule">
        <Icon name="ic-target" />
        Alerta si severidad {config.alertMinSeverity}–5{" "}
        <b style={{ color: "var(--muted)" }}>y</b> a menos de {config.alertRadiusMeters} m
        · el resto, aviso discreto
      </div>

      {rows.length === 0 ? (
        <div className="relative flex-1">
          <div className="empty">
            <div className="ring">
              <Icon name="ic-bell" />
            </div>
            <h4>Sin notificaciones</h4>
            <p>Te avisaremos cuando haya incidentes relevantes cerca de ti.</p>
          </div>
        </div>
      ) : (
        <div className="nlist">
          {groups.map((group) => (
            <Fragment key={group.label}>
              <div className="ngroup">{group.label}</div>
              {group.items.map((row) => {
                const tier = decideAlertTier({
                  severity: row.severity,
                  distanceMeters: row.distance_meters,
                });
                const isUnread = tier === "sheet";
                const { icon, color } = CATEGORY_STYLE[row.category];
                const chip = statusChip(row.status);

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedIncidentId(row.id)}
                    className={isUnread ? "notif unread" : "notif"}
                    style={{ textAlign: "left", width: "100%" }}
                  >
                    <div className="ni" style={{ background: color }}>
                      <Icon name={icon} />
                    </div>
                    <div className="nb">
                      <div className="nt">
                        {row.title}
                        <span
                          className={`tagpri ${isUnread ? "pri-alert" : "pri-soft"}`}
                        >
                          {isUnread ? "Alerta" : "Aviso"}
                        </span>
                      </div>
                      <div className="nmeta">
                        <span className="mono">{formatDistance(row.distance_meters)}</span>
                        <span className="mono">{formatAge(row.created_at)}</span>
                        {chip && <span className={`status ${chip.className}`}>{chip.label}</span>}
                      </div>
                    </div>
                    {isUnread && <span className="undot" />}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      {selectedIncidentId && (
        <IncidentDetailSheet
          incidentId={selectedIncidentId}
          onClose={() => setSelectedIncidentId(null)}
          viewer={location.current}
        />
      )}
    </div>
  );
}
