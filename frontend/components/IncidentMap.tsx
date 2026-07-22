"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import MapGL, { Marker, type MapRef } from "react-map-gl/maplibre";
import Supercluster from "supercluster";
import type { Category, IncidentStatus, NearbyIncident } from "@pulso/core";
import { IncidentDetailSheet, Icon, NotificationBell } from "@/components";
import {
  config,
  getNearbyIncidents,
  subscribeToIncidents,
  useCurrentLocation,
} from "@/lib";

// Map presentation values are intentionally separate from data: the categories come from
// the frozen domain contract, each mapped to its glyph, marker color, and the severity-border
// class used on the bottom-sheet rows.
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

// If the MapLibre style/tiles have not signalled a successful load within this window we treat
// the map as degraded (the "featureless blue field") and offer a retry instead of a blank map.
const MAP_LOAD_TIMEOUT_MS = 12_000;

type MapStatus = "loading" | "ready" | "error";

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

// The post-login home map: reads the shared current-location lifecycle, fetches nearby
// incidents, stays current through its own Realtime channel, and clusters markers so dense
// areas stay legible. Style/tile failures surface a Spanish error with retry.
export default function IncidentMap() {
  const mapRef = useRef<MapRef | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const location = useCurrentLocation();
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

  // Map render lifecycle: status + a key that forces a fresh mount when the user retries.
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapKey, setMapKey] = useState(0);
  // Viewport, sampled on load and after each move, drives clustering.
  const [mapBounds, setMapBounds] = useState<[number, number, number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(config.defaultZoom);

  // Monotonic request id so a slower default-coordinate response cannot overwrite a newer
  // GPS one, and Realtime refetches always reflect the latest coordinates.
  const requestId = useRef(0);
  const refreshRef = useRef<() => void>(() => undefined);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const rows = await getNearbyIncidents({ lat: location.lat, long: location.long });
      if (id !== requestId.current) return; // superseded by a newer query
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
              fresh.forEach((freshId) => next.delete(freshId));
              return next;
            });
          }, 8000);
        }
      }
      knownIdsRef.current = new Set(rows.map((row) => row.id));
    } catch {
      // Keep the last successful map state when connectivity is temporarily unavailable.
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [location.lat, location.long]);

  // Refetch whenever the resolved location changes.
  useEffect(() => {
    refreshRef.current = () => void refresh();
    void refresh();
  }, [refresh]);

  // Subscribe once; realtime changes refetch against the latest coordinates via the ref.
  useEffect(() => {
    const channel = subscribeToIncidents(() => refreshRef.current());
    return () => {
      void channel.unsubscribe();
    };
  }, []);

  // Recenter the map when the resolved location changes (e.g. GPS resolves or the user moves).
  useEffect(() => {
    mapRef.current?.flyTo({
      center: [location.long, location.lat],
      zoom: config.defaultZoom,
      duration: 600,
    });
  }, [location.lat, location.long]);

  // Guard against a degraded style/tile load that never fires `load` (blank blue map).
  useEffect(() => {
    if (mapStatus !== "loading") return;
    const timer = setTimeout(() => setMapStatus("error"), MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mapStatus, mapKey]);

  // The mic FAB floats just above whichever bottom sheet is mounted; measuring keeps it
  // clear of the sheet regardless of how many incident rows render.
  useEffect(() => {
    setSheetHeight(sheetRef.current?.offsetHeight ?? 0);
  }, [incidents, loading, selectedIncidentId, sheetHidden]);

  const clusterIndex = useMemo(() => {
    const index = new Supercluster({ radius: 64, maxZoom: 16, minPoints: 2 });
    index.load(
      incidents.map((incident) => ({
        type: "Feature" as const,
        properties: { incidentId: incident.id },
        geometry: {
          type: "Point" as const,
          coordinates: [incident.lng, incident.lat] as [number, number],
        },
      })),
    );
    return index;
  }, [incidents]);

  const incidentsById = useMemo(
    () => new Map(incidents.map((incident) => [incident.id, incident] as const)),
    [incidents],
  );

  const clusters = useMemo(() => {
    if (!mapBounds) return [];
    return clusterIndex.getClusters(mapBounds, Math.round(mapZoom));
  }, [clusterIndex, mapBounds, mapZoom]);

  const syncViewport = useCallback((map: MapRef) => {
    const bounds = map.getBounds();
    setMapBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    setMapZoom(map.getZoom());
  }, []);

  function retryMap(): void {
    setMapStatus("loading");
    setMapBounds(null);
    setMapKey((key) => key + 1);
  }

  function expandCluster(clusterId: number, lng: number, lat: number): void {
    const zoom = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), 18);
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 500 });
  }

  const activeCount = incidents.length;
  const fabBottom = sheetHidden ? 24 : Math.max(24, sheetHeight - sheetDragY + 16);

  // Banner reflects the same resolved location the map and query use: real fixes read neutral,
  // the configured venue appears only while the explicit fallback is active.
  const bannerName =
    location.source === "gps"
      ? "Tu ubicación"
      : location.source === "resolving"
        ? "Ubicando…"
        : config.venueName;
  const bannerSub =
    location.source === "gps"
      ? `Radio de búsqueda ${formatRadius(config.defaultRadiusMeters)}`
      : location.source === "resolving"
        ? "Buscando tu ubicación…"
        : `${config.venueCity} · radio ${formatRadius(config.defaultRadiusMeters)}`;

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
      <MapGL
        // A fresh mount per retry re-fetches the style/tiles cleanly; map reuse is intentionally
        // off so a pooled instance in a bad WebGL/style state can never resurface as a blank map.
        key={mapKey}
        ref={mapRef}
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: location.lat,
          longitude: location.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
        onLoad={(event) => {
          setMapStatus("ready");
          syncViewport(event.target as unknown as MapRef);
        }}
        onError={() => {
          // Only escalate failures that happen before the first successful render; transient
          // tile errors after load must not blank an otherwise-working map.
          setMapStatus((status) => (status === "ready" ? status : "error"));
        }}
        onMoveEnd={(event) => syncViewport(event.target as unknown as MapRef)}
      >
        <Marker latitude={location.lat} longitude={location.long} anchor="center">
          <span
            className="me"
            aria-label="Tu ubicación"
            // display:block — the mockup positions these spans absolutely (block box), but
            // inside a Marker they are static inline spans, and inline boxes collapse to
            // 0×0 (width/height are ignored), making the dot invisible.
            style={{ display: "block", position: "relative", left: "auto", top: "auto", margin: 0 }}
          >
            <b />
          </span>
        </Marker>

        {clusters.map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          const properties = feature.properties as Supercluster.AnyProps;

          if (properties.cluster) {
            const clusterId = properties.cluster_id as number;
            const count = properties.point_count as number;
            return (
              <Marker key={`cluster-${clusterId}`} latitude={lat} longitude={lng} anchor="center">
                <button
                  type="button"
                  className="imk-cluster"
                  aria-label={`${count} incidentes en esta zona. Acercar para ver el detalle.`}
                  onClick={(event) => {
                    event.stopPropagation();
                    expandCluster(clusterId, lng, lat);
                  }}
                >
                  {count}
                </button>
              </Marker>
            );
          }

          const incident = incidentsById.get(properties.incidentId as string);
          if (!incident) return null;
          const isNew = newIds.has(incident.id);
          const isSelected = selectedIncidentId === incident.id;
          const isHighSeverity = incident.severity >= config.alertMinSeverity;

          return (
            <Marker key={incident.id} latitude={incident.lat} longitude={incident.lng} anchor="center">
              <span
                role="button"
                tabIndex={0}
                aria-label={`${CATEGORY_LABEL[incident.category]}, severidad ${incident.severity} de 5`}
                className={`imk${isSelected ? " sel" : ""}${isNew ? " new" : ""}${
                  isHighSeverity ? " sev-hi" : ""
                }`}
                style={{ "--mk": CATEGORY_COLOR[incident.category] } as CSSProperties}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIncidentId(incident.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedIncidentId(incident.id);
                  }
                }}
              >
                <span className="imk-disc">
                  <Icon name={CATEGORY_ICON[incident.category]} />
                </span>
                <span className="imk-sev">{incident.severity}</span>
              </span>
            </Marker>
          );
        })}
      </MapGL>

      {mapStatus === "loading" ? (
        <div className="map-note" role="status">
          <span className="map-spin" aria-hidden="true" />
          Cargando mapa…
        </div>
      ) : null}

      {mapStatus === "error" ? (
        <div className="map-fallback" role="alert">
          <Icon name="ic-map" />
          <h4>No pudimos cargar el mapa</h4>
          <p>Revisa tu conexión e inténtalo de nuevo. Los incidentes cercanos siguen disponibles abajo.</p>
          <button type="button" className="btn primary sm" style={{ width: "auto", padding: "10px 18px" }} onClick={retryMap}>
            Reintentar
          </button>
        </div>
      ) : null}

      {!selectedIncidentId ? (
        <>
          <div className="map-top">
            <div className="sector">
              <Icon name="ic-pin" />
              <div>
                <div className="nm">{bannerName}</div>
                <div className="sub">{bannerSub}</div>
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
          viewer={{ lat: location.lat, long: location.long }}
        />
      ) : null}
    </section>
  );
}
