"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  config,
  FALLBACK_LOCATION,
  haversineMeters,
  LocationContext,
  type CurrentLocation,
} from "@/lib";

// Options tuned for a mobile PWA: a real fix within a few seconds, but a cached recent one is
// fine so resuming the app does not always wait on a cold GPS lock.
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 30_000,
};

// The single current-location lifecycle. It resolves the device position once, refreshes it
// when the app returns to the foreground, and drops jittery samples so consumers only refetch
// on a genuine move. Configured coordinates are used only as an explicit fallback.
export default function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<CurrentLocation>({
    ...FALLBACK_LOCATION,
    source: "resolving",
  });

  // Latest sample lives in a ref so the resolve/error callbacks can dedupe against it without
  // re-subscribing the geolocation lifecycle on every update.
  const latest = useRef(location);
  latest.current = location;

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation(FALLBACK_LOCATION);
      return;
    }

    let active = true;

    function resolve(): void {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!active) return;
          const next: CurrentLocation = {
            lat: position.coords.latitude,
            long: position.coords.longitude,
            source: "gps",
          };
          const previous = latest.current;
          // Keep the same reference for sub-threshold jitter so dependent queries and the
          // notification-host reseed do not churn on every foreground return.
          if (
            previous.source === "gps" &&
            haversineMeters(previous.lat, previous.long, next.lat, next.long) <
              config.locationRefreshMeters
          ) {
            return;
          }
          setLocation(next);
        },
        () => {
          if (!active) return;
          // A denied/failed refresh must not discard a fix we already have.
          setLocation((previous) =>
            previous.source === "gps" ? previous : FALLBACK_LOCATION,
          );
        },
        GEOLOCATION_OPTIONS,
      );
    }

    resolve();

    function onVisibility(): void {
      if (document.visibilityState === "visible") resolve();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", resolve);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", resolve);
    };
  }, []);

  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>;
}
