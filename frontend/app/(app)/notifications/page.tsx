"use client";

import { useEffect, useState } from "react";
import type { NearbyIncident } from "@pulso/core";
import {
  config,
  decideAlertTier,
  getNearbyIncidents,
  subscribeToNotificationIncidents,
} from "@/lib";

// Notification center: incidents remain available here even after a transient sheet or toast
// has been dismissed. Its subscription intentionally uses the notifications-specific channel.
export default function NotificationsPage() {
  const [rows, setRows] = useState<NearbyIncident[]>([]);
  const [location, setLocation] = useState({
    lat: config.defaultLat,
    long: config.defaultLng,
  });

  useEffect(() => {
    let active = true;

    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        if (!active) return;
        setLocation({ lat: pos.coords.latitude, long: pos.coords.longitude });
      },
      () => undefined,
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getNearbyIncidents(location)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        if (active) setRows([]);
      });

    const channel = subscribeToNotificationIncidents(() => {
      void getNearbyIncidents(location)
        .then((data) => {
          if (active) setRows(data);
        })
        .catch(() => undefined);
    });

    return () => {
      active = false;
      void channel.unsubscribe();
    };
  }, [location]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg px-3 pb-3 pt-3.5">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-[19px] font-extrabold tracking-[-0.02em]">Notificaciones</h1>
        <button
          type="button"
          className="rounded-md px-1 py-1 text-[10.5px] font-bold text-accent transition-colors hover:bg-[rgba(53,224,193,0.08)]"
        >
          Marcar leídas
        </button>
      </header>

      <div className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-line bg-panel px-2.5 py-2 text-[10px] leading-tight text-faint">
        <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[rgba(53,224,193,0.11)] text-accent">
          <svg
            width={10}
            height={10}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l2.5 1.5" />
          </svg>
        </span>
        <span>
          Alerta si severidad {config.alertMinSeverity}–5 y a menos de {config.alertRadiusMeters} m ·
          el resto, aviso discreto.
        </span>
      </div>

      {rows.length > 0 && (
        <p className="mb-2.5 mt-4 px-1 text-[9.5px] font-bold tracking-[0.13em] text-faint">
          AHORA
        </p>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-3">
        {rows.map((row) => {
          const tier = decideAlertTier({
            severity: row.severity,
            distanceMeters: row.distance_meters,
          });
          const icon =
            row.category === "fire"
              ? "♨"
              : row.category === "flood"
                ? "◈"
                : row.category === "road_closure"
                  ? "╱╲"
                  : row.category === "accident"
                    ? "▰"
                    : "!";
          const iconColor =
            row.category === "fire"
              ? "var(--sev-fire)"
              : row.category === "flood"
                ? "var(--sev-flood)"
                : row.category === "road_closure"
                  ? "var(--sev-road)"
                  : row.category === "accident"
                    ? "var(--sev-accident)"
                    : "var(--sev-event)";

          return (
            <article
              key={row.id}
              className="relative flex items-start gap-3 rounded-[14px] border border-line bg-panel p-3 shadow-[0_10px_20px_-20px_#000]"
            >
              {tier === "sheet" && (
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-accent shadow-[0_0_9px_var(--accent)]" />
              )}
              <span
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-[17px] font-extrabold text-[#08121a]"
                style={{ background: iconColor }}
                aria-hidden="true"
              >
                {icon}
              </span>
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 text-[13.5px] font-extrabold leading-5 text-ink">
                    {row.title}
                  </h2>
                  <span
                    className="mt-0.5 rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide"
                    style={
                      tier === "sheet"
                        ? { color: "#fff", background: "color-mix(in srgb, var(--sev-fire) 72%, transparent)" }
                        : { color: "var(--muted)", background: "var(--panel-2)" }
                    }
                  >
                    {tier === "sheet" ? "Alerta" : "Aviso"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted">
                  <span>a {Math.round(row.distance_meters)} m</span>
                  <span>·</span>
                  <span>{new Date(row.created_at).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}</span>
                  {row.status === "confirmed" && (
                    <span className="font-semibold text-ok">✓ verificado</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {rows.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-line text-accent">
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2.3H4.4z" />
                <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
              </svg>
            </span>
            <h2 className="mt-4 text-[15px] font-extrabold">No tienes novedades</h2>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              Te avisaremos cuando haya incidentes relevantes cerca de ti.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
