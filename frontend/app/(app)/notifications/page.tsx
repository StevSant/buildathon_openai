"use client";

import { useEffect, useState } from "react";
import type { NearbyIncident } from "@pulso/core";
import { config, decideAlertTier, getNearbyIncidents } from "@/lib";

// Notification center — the feed of recent nearby incidents, opened from the map's bell.
// Each item is tagged by the same 3-tier rule: "Alerta" fired a bottom sheet (severe AND
// close), "Aviso" was a discreet toast.
export default function NotificationsPage() {
  const [rows, setRows] = useState<NearbyIncident[]>([]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        setRows(
          await getNearbyIncidents({
            lat: pos.coords.latitude,
            long: pos.coords.longitude,
          }),
        );
      },
      async () => {
        setRows(
          await getNearbyIncidents({
            lat: config.defaultLat,
            long: config.defaultLng,
          }),
        );
      },
    );
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
        <h1 className="text-[18px] font-extrabold">Notificaciones</h1>
        <button type="button" className="bg-transparent text-[11px] font-semibold text-accent">
          Marcar leídas
        </button>
      </div>

      <div className="mx-3 mb-1.5 flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-[10.5px] text-faint">
        Alerta si severidad {config.alertMinSeverity}–5 y a menos de {config.alertRadiusMeters} m ·
        el resto, aviso discreto.
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {rows.map((row) => {
          const tier = decideAlertTier({
            severity: row.severity,
            distanceMeters: row.distance_meters,
          });
          return (
            <div
              key={row.id}
              className="flex items-start gap-3 rounded-[14px] border border-line bg-panel p-3"
            >
              <span
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-[#08121a]"
                style={{
                  background:
                    tier === "sheet" ? "var(--sev-fire)" : "var(--panel-2)",
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-bold">
                  <span className="truncate">{row.title}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={
                      tier === "sheet"
                        ? { color: "#fff", background: "color-mix(in srgb, var(--sev-fire) 72%, transparent)" }
                        : { color: "var(--muted)", background: "var(--panel-2)" }
                    }
                  >
                    {tier === "sheet" ? "Alerta" : "Aviso"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span>a ~{Math.round(row.distance_meters)} m</span>
                  <span>·</span>
                  <span>{row.status}</span>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="mt-8 text-center text-[12.5px] text-muted">
            Nada activo cerca. Si ves algo, sé el primero en reportarlo.
          </p>
        )}
      </div>
    </div>
  );
}
