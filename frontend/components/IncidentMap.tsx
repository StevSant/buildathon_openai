"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import type { Category, IncidentStatus, NearbyIncident } from "@pulso/core";
import { IncidentDetailSheet, NotificationBell } from "@/components";
import { config, getNearbyIncidents, subscribeToIncidents } from "@/lib";

// Map presentation values are intentionally separate from data: the categories come from
// the frozen domain contract while severity is represented by pin scale and glow.
const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

const CATEGORY_LABEL: Record<Category, string> = {
  road_closure: "Cierre vial",
  accident: "Accidente",
  flood: "Inundación",
  fire: "Incendio",
  public_event: "Evento público",
  other: "Incidente",
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  provisional: "Provisional",
  confirmed: "Confirmado",
  disputed: "En disputa",
  resolved: "Resuelto",
};

// The post-login home map: fetches nearby incidents, stays current through its own Realtime
// channel, and shows every incident because the RPC guarantees lng/lat on each row.
export default function IncidentMap() {
  const mapRef = useRef<MapRef | null>(null);
  const [center, setCenter] = useState({
    lat: config.defaultLat,
    long: config.defaultLng,
  });
  const [incidents, setIncidents] = useState<NearbyIncident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await getNearbyIncidents({ lat: center.lat, long: center.long });
      setIncidents(rows);
    } catch {
      // Keep the last successful map state when connectivity is temporarily unavailable.
    }
  }, [center.lat, center.long]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        const nextCenter = {
          lat: position.coords.latitude,
          long: position.coords.longitude,
        };
        setCenter(nextCenter);
        mapRef.current?.flyTo({
          center: [nextCenter.long, nextCenter.lat],
          zoom: config.defaultZoom,
        });
      },
      () => {
        // The configured venue remains the useful fallback if location access is denied.
      },
    );
  }, []);

  useEffect(() => {
    void refresh();
    const channel = subscribeToIncidents(() => void refresh());

    return () => {
      void channel.unsubscribe();
    };
  }, [refresh]);

  return (
    <section className="relative flex-1 overflow-hidden bg-bg" aria-label="Mapa de incidentes">
      <Map
        ref={mapRef}
        reuseMaps
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: center.lat,
          longitude: center.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={center.lat} longitude={center.long} anchor="center">
          <span className="relative flex h-11 w-11 items-center justify-center" aria-label="Tu ubicación">
            <span className="absolute inset-0 rounded-full border border-accent/50 bg-accent/10" />
            <span className="absolute h-6 w-6 rounded-full border-2 border-accent bg-[rgba(10,30,30,0.9)] shadow-[0_0_24px_var(--accent)]" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
        </Marker>

        {incidents.map((incident) => {
          const color = CATEGORY_COLOR[incident.category];
          const markerSize = incident.severity >= 4 ? "h-10 w-10" : "h-8 w-8";

          return (
            <Marker
              key={incident.id}
              latitude={incident.lat}
              longitude={incident.lng}
              anchor="bottom"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelectedIncidentId(incident.id);
              }}
            >
              <button
                type="button"
                aria-label={`${CATEGORY_LABEL[incident.category]}, severidad ${incident.severity}`}
                className={`relative flex ${markerSize} items-center justify-center rounded-2xl border-2 border-[#081017] text-[#071018] shadow-[0_8px_18px_rgba(0,0,0,0.48)] transition-transform active:scale-95`}
                style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}` }}
              >
                {incident.severity >= 4 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -inset-1 rounded-[18px] border opacity-60"
                    style={{ borderColor: color }}
                  />
                ) : null}
                <svg
                  aria-hidden="true"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {incident.category === "fire" ? (
                    <path d="M12 22c4 0 7-2.7 7-6.5 0-3-2.1-5.1-4.3-7.7.1 2.5-1.1 3.8-2.7 4.8.2-3-1.2-5.3-3.3-7.6C8.7 9.2 5 11.5 5 15.5 5 19.3 8 22 12 22Z" />
                  ) : incident.category === "flood" ? (
                    <>
                      <path d="M7 15.5c1.2 1 2.8 1 4 0 1.2 1 2.8 1 4 0 1.2 1 2.8 1 4 0" />
                      <path d="M7 19c1.2 1 2.8 1 4 0 1.2 1 2.8 1 4 0 1.2 1 2.8 1 4 0" />
                      <path d="M12 3c-2.7 3.2-4 5.3-4 7.1a4 4 0 0 0 8 0C16 8.3 14.7 6.2 12 3Z" />
                    </>
                  ) : incident.category === "road_closure" ? (
                    <>
                      <path d="M4 18h16" />
                      <path d="m6 18 2-9h8l2 9" />
                      <path d="M8 12h8" />
                    </>
                  ) : incident.category === "public_event" ? (
                    <>
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5 21c.8-4 3.2-6 7-6s6.2 2 7 6" />
                    </>
                  ) : incident.category === "accident" ? (
                    <>
                      <path d="M5 16h14l-1.5-5H7.5L5 16Z" />
                      <path d="M8 11 9.5 8h5L16 11" />
                      <circle cx="8" cy="17" r="1.5" />
                      <circle cx="16" cy="17" r="1.5" />
                    </>
                  ) : (
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-12v4m0 4h.01" />
                  )}
                </svg>
              </button>
            </Marker>
          );
        })}
      </Map>

      <header className="absolute inset-x-3.5 top-5 z-10 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-[rgba(18,25,34,0.92)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur">
          <svg
            aria-hidden="true"
            width={17}
            height={17}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-none text-ink">{config.venueName}</p>
            <p className="mt-1 text-[10.5px] leading-none text-muted">
              {config.venueCity} · {config.defaultRadiusMeters >= 1000
                ? `${config.defaultRadiusMeters / 1000} km`
                : `${config.defaultRadiusMeters} m`}
            </p>
          </div>
          <span className="ml-auto text-muted" aria-hidden="true">›</span>
        </div>
        <NotificationBell unread={incidents.length > 0 ? 1 : 0} />
      </header>

      {!selectedIncidentId ? (
        <div className="absolute inset-x-0 bottom-0 z-[3] rounded-t-[22px] border-t border-line bg-[rgba(18,25,34,0.97)] px-4 pb-3.5 pt-3 shadow-[0_-12px_28px_rgba(0,0,0,0.18)] backdrop-blur">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
          <h1 className="mb-2.5 text-[13px] font-medium text-muted">
            Cerca de ti · <span className="font-bold text-ink">{incidents.length} incidentes activos</span>
          </h1>

          {incidents.length > 0 ? (
            <div className="divide-y divide-line">
              {incidents.slice(0, 3).map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelectedIncidentId(incident.id)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-panel-2"
                    style={{ color: CATEGORY_COLOR[incident.category] }}
                    aria-hidden="true"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">{incident.title}</span>
                    <span className="mt-0.5 block text-[10.5px] text-muted">
                      {incident.distance_meters >= 1000
                        ? `${(incident.distance_meters / 1000).toFixed(1)} km`
                        : `${Math.round(incident.distance_meters)} m`}
                      {" · "}{CATEGORY_LABEL[incident.category]}
                    </span>
                  </span>
                  <span
                    className="rounded-md px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide"
                    style={{
                      color: CATEGORY_COLOR[incident.category],
                      backgroundColor: "color-mix(in srgb, currentColor 15%, transparent)",
                    }}
                  >
                    {STATUS_LABEL[incident.status]}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="pb-1 text-[12px] leading-relaxed text-muted">
              No hay incidentes activos en esta zona. Si ves algo, repórtalo para alertar a la comunidad.
            </p>
          )}
        </div>
      ) : null}

      {selectedIncidentId ? (
        <IncidentDetailSheet
          incidentId={selectedIncidentId}
          onClose={() => setSelectedIncidentId(null)}
        />
      ) : null}
    </section>
  );
}
