"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useState } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Category, NearbyIncident } from "@pulso/core";
import { config, getNearbyIncidents, subscribeToIncidents } from "@/lib";
import NotificationBell from "./NotificationBell";
import IncidentDetailSheet from "./IncidentDetailSheet";

// Live map. Renders MapLibre, loads nearby incidents, subscribes to Realtime, and opens the
// detail sheet on a pin tap. A top bar shows the sector + the notifications bell.
// get_nearby_incidents returns lng/lat with every row (CONTRACT §2), so pins render directly.

const CATEGORY_COLOR: Record<Category, string> = {
  fire: "var(--sev-fire)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  road_closure: "var(--sev-road)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

export default function IncidentMap() {
  const [center, setCenter] = useState({
    lat: config.defaultLat,
    long: config.defaultLng,
  });
  const [incidents, setIncidents] = useState<NearbyIncident[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await getNearbyIncidents({
        lat: center.lat,
        long: center.long,
      });
      setIncidents(rows);
    } catch {
      // A transient query error should not blank the map; keep the last good state.
    }
  }, [center.lat, center.long]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, long: pos.coords.longitude }),
      () => {
        /* fall back to the configured default center */
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
    <div className="relative flex-1">
      <Map
        reuseMaps
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: center.lat,
          longitude: center.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={center.lat} longitude={center.long}>
          <span className="block h-4 w-4 rounded-full border-2 border-[#06120f] bg-accent shadow-[0_0_14px_var(--accent)]" />
        </Marker>

        {incidents.map((inc) => (
          <Marker
            key={inc.id}
            latitude={inc.lat}
            longitude={inc.lng}
            onClick={() => setSelected(inc.id)}
          >
            <span
              className="block h-3.5 w-3.5 rounded-[50%_50%_50%_2px] shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
              style={{
                background: CATEGORY_COLOR[inc.category] ?? "var(--muted)",
                transform: "rotate(45deg)",
              }}
            />
          </Marker>
        ))}
      </Map>

      {/* Top bar: sector + bell */}
      <div className="absolute inset-x-3.5 top-11 z-10 flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-[rgba(18,25,34,0.92)] px-3 py-2.5 backdrop-blur">
          <div>
            <div className="text-[13px] font-semibold">{config.venueName}</div>
            <div className="text-[10.5px] text-muted">
              {config.venueCity} · {Math.round(config.defaultRadiusMeters / 1000)} km
            </div>
          </div>
        </div>
        <NotificationBell unread={incidents.length ? 1 : 0} />
      </div>

      {/* Bottom sheet summary */}
      {!selected && (
        <div className="absolute inset-x-0 bottom-0 z-[3] rounded-t-[20px] border-t border-line bg-panel px-3.5 pb-3.5 pt-3">
          <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-line" />
          <h3 className="m-0 mb-2 text-[13px] font-semibold text-muted">
            Cerca de ti · <b className="text-ink">{incidents.length} incidentes activos</b>
          </h3>
          <div className="flex flex-col">
            {incidents.slice(0, 3).map((inc) => (
              <button
                key={inc.id}
                type="button"
                onClick={() => setSelected(inc.id)}
                className="flex items-center gap-3 border-t border-line py-2.5 text-left first:border-t-0"
              >
                <span
                  className="h-8 w-1 flex-none rounded"
                  style={{ background: CATEGORY_COLOR[inc.category] ?? "var(--muted)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {inc.title}
                  </span>
                  <span className="text-[11.5px] text-muted">{inc.status}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <IncidentDetailSheet incidentId={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
