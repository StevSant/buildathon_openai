"use client";

import { createContext, useContext } from "react";
import { config } from "./config";

// One shared current-location sample for the whole authenticated shell. The map, the
// notification host, and the notification center all read from this single lifecycle so a
// slow default-coordinate response can never overwrite a newer GPS one, and every surface
// converges on the same coordinates (see LocationProvider for the lifecycle itself).

// - "resolving" → geolocation in flight; coordinates are still the configured fallback.
// - "gps"       → a real device position resolved.
// - "fallback"  → geolocation unavailable or denied; configured venue is the explicit fallback.
export type LocationSource = "resolving" | "gps" | "fallback";

export interface CurrentLocation {
  readonly lat: number;
  readonly long: number;
  readonly source: LocationSource;
}

// Configured venue coordinates, used only while geolocation has not produced a real fix.
export const FALLBACK_LOCATION: CurrentLocation = {
  lat: config.defaultLat,
  long: config.defaultLng,
  source: "fallback",
};

// Before the provider mounts (or outside it) the value reads as "resolving" at the venue so
// the map always has coordinates to render without ever claiming the venue is the real fix.
export const LocationContext = createContext<CurrentLocation>({
  ...FALLBACK_LOCATION,
  source: "resolving",
});

export function useCurrentLocation(): CurrentLocation {
  return useContext(LocationContext);
}
