"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import type { Category, IncidentStatus, NearbyIncident } from "@pulso/core";
import { IncidentDetailSheet, Icon, NotificationBell } from "@/components";
import { config, getNearbyIncidents, subscribeToIncidents } from "@/lib";

// Map presentation values are intentionally separate from data: the categories come from
// the frozen domain contract, each mapped to its mockup pin color, list icon, and the
// severity-border class used on the bottom-sheet rows.
const CATEGORY_PIN: Record<Category, string> = {
  road_closure: "p-road",
  accident: "p-acc",
  flood: "p-flood",
  fire: "p-fire",
  public_event: "p-evt",
  other: "p-acc",
};

const CATEGORY_ICON: Record<Category, string> = {
  road_closure: "ic-road",
  accident: "ic-car",
  flood: "ic-water",
  fire: "ic-fire",
  public_event: "ic-spark",
  other: "ic-alert",
};

const CATEGORY_SEV: Record<Category, string> = {
  road_closure: "sev-road",
  accident: "sev-acc",
  flood: "sev-flood",
  fire: "sev-fire",
  public_event: "sev-evt",
  other: "sev-acc",
};

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

// Only two chip styles exist in the mockup; confirmed/resolved read as "settled", the rest
// as "provisional".
const STATUS_CHIP: Record<IncidentStatus, { className: string; label: string }> = {
  provisional: { className: "st-prov", label: "provisional" },
  confirmed: { className: "st-conf", label: "confirmado" },
  disputed: { className: "st-prov", label: "en disputa" },
  resolved: { className: "st-conf", label: "resuelto" },
};

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
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

// The post-login home map: fetches nearby incidents, stays current through its own Realtime
// channel, and shows every incident because the RPC guarantees lng/lat on each row.
export default function IncidentMap() {
  const mapRef = useRef<MapRef | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [center, setCenter] = useState({
    lat: config.defaultLat,
    long: config.defaultLng,
  });
  const [incidents, setIncidents] = useState<NearbyIncident[]>([]);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const knownIdsRef = useRef<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [sheetHidden, setSheetHidden] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetPointerStartY = useRef<number | null>(null);
  const sheetDragDistance = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const rows = await getNearbyIncidents({ lat: center.lat, long: center.long });
      setIncidents(rows);

      // A pin that arrives after the first load "drops" with a ripple for a few seconds,
      // mirroring the mockup's recién-publicado animation.
      const known = knownIdsRef.current;
      if (known) {
        const fresh = rows.filter((row) => !known.has(row.id)).map((row) => row.id);
        if (fresh.length > 0) {
          setNewIds((previous) => new Set([...previous, ...fresh]));
          setTimeout(() => {
            setNewIds((previous) => {
              const next = new Set(previous);
              fresh.forEach((id) => next.delete(id));
              return next;
            });
          }, 8000);
        }
      }
      knownIdsRef.current = new Set(rows.map((row) => row.id));
    } catch {
      // Keep the last successful map state when connectivity is temporarily unavailable.
    } finally {
      setLoading(false);
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

  // The mic FAB floats just above whichever bottom sheet is mounted; measuring keeps it
  // clear of the sheet regardless of how many incident rows render.
  useEffect(() => {
    setSheetHeight(sheetRef.current?.offsetHeight ?? 0);
  }, [incidents, loading, selectedIncidentId, sheetHidden]);

  const activeCount = incidents.length;
  const fabBottom = sheetHidden ? 24 : Math.max(24, sheetHeight - sheetDragY + 16);

  function releaseSheetHandle(): void {
    const shouldHide = sheetDragDistance.current > (sheetRef.current?.offsetHeight ?? 0) / 4;
    setSheetHidden(shouldHide);
    setSheetDragY(0);
    sheetPointerStartY.current = null;
    sheetDragDistance.current = 0;
  }

  function startSheetDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    sheetPointerStartY.current = event.clientY;
    sheetDragDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragSheet(event: ReactPointerEvent<HTMLDivElement>): void {
    if (sheetPointerStartY.current === null) return;
    const distance = Math.max(0, event.clientY - sheetPointerStartY.current);
    sheetDragDistance.current = distance;
    setSheetDragY(distance);
  }

  return (
    <section className="s-map" aria-label="Mapa de incidentes">
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
          <span
            className="me"
            aria-label="Tu ubicación"
            style={{ position: "relative", left: "auto", top: "auto", margin: 0 }}
          >
            <b />
          </span>
        </Marker>

        {incidents.map((incident) => (
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
            <span
              className={`pin ${CATEGORY_PIN[incident.category]}${
                newIds.has(incident.id) ? " new" : ""
              }`}
              aria-label={`${CATEGORY_LABEL[incident.category]}, severidad ${incident.severity}`}
              style={{
                position: "relative",
                transform: "rotate(45deg)",
                cursor: "pointer",
                // The mockup's drop keyframes re-anchor via translate, which fights the
                // Marker transform; keep only the <b> ripple on the pin itself.
                animation: "none",
              }}
            >
              {newIds.has(incident.id) ? (
                <b style={{ borderColor: CATEGORY_COLOR[incident.category] }} />
              ) : null}
            </span>
          </Marker>
        ))}
      </Map>

      {!selectedIncidentId ? (
        <>
          <div className="map-top">
            <div className="sector">
              <Icon name="ic-pin" />
              <div>
                <div className="nm">{config.venueName}</div>
                <div className="sub">
                  {config.venueCity} · {formatRadius(config.defaultRadiusMeters)}
                </div>
              </div>
              <Icon name="ic-chevron" className="chev" />
            </div>
            <NotificationBell unread={activeCount > 0 ? 1 : 0} />
          </div>

          <Link href="/assistant" className="fab" aria-label="Hablar con Cerca" style={{ bottom: fabBottom }}>
            <Icon name="ic-mic" />
          </Link>

          {loading ? (
            <div className="skel-sheet" ref={sheetRef}>
              <div className="grab" />
              <div className="skrow">
                <span className="sk box" />
                <div style={{ flex: 1 }}>
                  <span className="sk l1" style={{ display: "block" }} />
                  <span className="sk l2" style={{ display: "block" }} />
                </div>
              </div>
              <div className="skrow">
                <span className="sk box" />
                <div style={{ flex: 1 }}>
                  <span className="sk l1" style={{ display: "block" }} />
                  <span className="sk l2" style={{ display: "block" }} />
                </div>
              </div>
            </div>
          ) : activeCount > 0 && !sheetHidden ? (
            <div
              className="sheet"
              ref={sheetRef}
              style={{
                transform: `translateY(${sheetDragY}px)`,
                transition: sheetPointerStartY.current === null ? "transform 180ms ease-out" : "none",
              }}
            >
              <div
                className="grab"
                role="button"
                tabIndex={0}
                aria-label="Desliza hacia abajo para ocultar incidentes cercanos"
                onPointerDown={startSheetDrag}
                onPointerMove={dragSheet}
                onPointerUp={releaseSheetHandle}
                onPointerCancel={releaseSheetHandle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSheetHidden(true);
                  }
                }}
              />
              <h3>
                Cerca de ti · <b>{activeCount} incidentes activos</b>
              </h3>
              {incidents.slice(0, 3).map((incident) => {
                const status = STATUS_CHIP[incident.status];
                const open = () => setSelectedIncidentId(incident.id);
                return (
                  <div
                    key={incident.id}
                    role="button"
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        open();
                      }
                    }}
                    aria-label={`${incident.title}, ${CATEGORY_LABEL[incident.category]}`}
                    className={`inc ${CATEGORY_SEV[incident.category]}`}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="ic">
                      <Icon
                        name={CATEGORY_ICON[incident.category]}
                        style={{ color: CATEGORY_COLOR[incident.category] }}
                      />
                    </div>
                    <div className="body">
                      <div className="title">{incident.title}</div>
                      <div className="meta">
                        <span className="mono">{formatDistance(incident.distance_meters)}</span>
                        <span className="mono">{formatRelativeTime(incident.created_at)}</span>
                        <span className={`status ${status.className}`}>{status.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : activeCount > 0 ? (
            <button
              type="button"
              onClick={() => setSheetHidden(false)}
              className="rounded-full border border-line bg-panel px-4 py-2 text-[12px] font-bold text-ink shadow-[0_8px_22px_rgba(0,0,0,0.25)]"
              style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 3 }}
            >
              Mostrar {activeCount} incidentes cercanos
            </button>
          ) : (
            <div className="empty" style={{ pointerEvents: "none" }}>
              <div className="ring">
                <Icon name="ic-target" />
              </div>
              <h4>Sin incidentes cerca</h4>
              <p>
                Nada activo en {formatRadius(config.defaultRadiusMeters)}. Si ves algo, sé el
                primero en reportarlo.
              </p>
              <Link
                href="/report"
                className="btn primary sm"
                style={{ width: "auto", padding: "10px 18px", pointerEvents: "auto" }}
              >
                Reportar algo
              </Link>
            </div>
          )}
        </>
      ) : null}

      {selectedIncidentId ? (
        <IncidentDetailSheet
          incidentId={selectedIncidentId}
          onClose={() => setSelectedIncidentId(null)}
          viewer={center}
        />
      ) : null}
    </section>
  );
}
