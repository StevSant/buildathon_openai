"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Category } from "@pulso/core";
import { config } from "@/lib";

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

// Compact, non-interactive map for a single incident inside the assistant detail card:
// one category-colored pin at the reported coordinates. Rendered only when valid coordinates
// are available, so the card degrades gracefully when they are not (issue #4).
export default function AssistantIncidentDetailMap({
  category,
  latitude,
  longitude,
  title,
}: {
  category: Category;
  latitude: number;
  longitude: number;
  title: string;
}) {
  return (
    <div
      className="assistant-map"
      role="img"
      aria-label={`Mapa del incidente: ${title}`}
    >
      <Map
        reuseMaps
        interactive={false}
        attributionControl={false}
        mapStyle={config.mapStyleUrl}
        initialViewState={{ latitude, longitude, zoom: config.defaultZoom }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={latitude} longitude={longitude} anchor="bottom">
          <span
            className="assistant-map-pin"
            aria-hidden="true"
            style={{ background: CATEGORY_COLOR[category] }}
          />
        </Marker>
      </Map>
    </div>
  );
}
