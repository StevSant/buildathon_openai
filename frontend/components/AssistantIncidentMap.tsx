"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Category, NearbyIncident } from "@pulso/core";
import { config, type AssistantLocation } from "@/lib";

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

export default function AssistantIncidentMap({
  incidents,
  center,
}: {
  incidents: NearbyIncident[];
  center: AssistantLocation;
}) {
  return (
    <div
      className="assistant-map"
      role="img"
      aria-label={`Mapa compacto con ${incidents.length} ${
        incidents.length === 1 ? "incidente cercano" : "incidentes cercanos"
      }`}
    >
      <Map
        reuseMaps
        interactive={false}
        attributionControl={false}
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: center.lat,
          longitude: center.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={center.lat} longitude={center.long} anchor="center">
          <span className="assistant-map-user" aria-hidden="true" />
        </Marker>

        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            latitude={incident.lat}
            longitude={incident.lng}
            anchor="bottom"
          >
            <span
              className="assistant-map-pin"
              aria-hidden="true"
              style={{ background: CATEGORY_COLOR[incident.category] }}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}
