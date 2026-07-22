"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, NearbyIncident } from "@pulso/core";
import {
  decideAlertTier,
  getNearbyIncidents,
  playNotificationSound,
  readNotificationSoundEnabled,
  supabase,
  subscribeToNotificationIncidents,
  useCurrentLocation,
} from "@/lib";
import NotificationBottomSheet from "./NotificationBottomSheet";
import NotificationToast from "./NotificationToast";

type ToastIncident = {
  id: string;
  title: string;
  category: Category;
};

function formatIncidentAge(createdAt: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000),
  );

  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

// The app-wide notification surface reads the shared current-location lifecycle, seeds its
// baseline rows before alerting, and presents only genuinely new nearby incidents. Its Realtime
// channel is intentionally separate from the map's.
export default function NotificationHost() {
  const router = useRouter();
  const location = useCurrentLocation();
  const [sheet, setSheet] = useState<NearbyIncident | null>(null);
  const [toast, setToast] = useState<ToastIncident | null>(null);
  const hasSeeded = useRef(false);
  const seenIds = useRef<Set<string>>(new Set());
  // Monotonic request id so a slower default-coordinate response cannot surface stale-area
  // incidents after a newer GPS query has taken over.
  const requestId = useRef(0);
  // Latest coordinates in a ref so the once-only Realtime subscription always queries the
  // current location without re-subscribing on every move.
  const locationRef = useRef(location);
  locationRef.current = location;

  const showIncident = useCallback((incident: NearbyIncident): void => {
    const tier = decideAlertTier({
      severity: incident.severity,
      distanceMeters: incident.distance_meters,
    });

    if (tier === "sheet") {
      setSheet(incident);
    } else {
      setToast({ id: incident.id, title: incident.title, category: incident.category });
    }

    // Foreground audible cue for a genuinely new alert; guarded so it never fires on load,
    // refresh, or reseed (only ids not already in seenIds reach here).
    if (readNotificationSoundEnabled()) void playNotificationSound();
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const id = ++requestId.current;
    let incidents: NearbyIncident[];
    try {
      incidents = await getNearbyIncidents({
        lat: locationRef.current.lat,
        long: locationRef.current.long,
      });
    } catch {
      return;
    }
    if (id !== requestId.current) return; // superseded by a newer query

    if (!hasSeeded.current) {
      incidents.forEach(({ id: incidentId }) => seenIds.current.add(incidentId));
      hasSeeded.current = true;
      return;
    }

    incidents.forEach((incident) => {
      if (seenIds.current.has(incident.id)) return;
      seenIds.current.add(incident.id);
      showIncident(incident);
    });
  }, [showIncident]);

  // Reseed the baseline whenever the location changes: the new area's existing incidents become
  // the baseline (no alert storm), and out-of-radius incidents from the previous area drop out.
  useEffect(() => {
    hasSeeded.current = false;
    seenIds.current = new Set();
    void refresh();
  }, [location.lat, location.long, refresh]);

  // Subscribe once; realtime changes refetch against the latest coordinates.
  useEffect(() => {
    const channel = subscribeToNotificationIncidents("host", () => void refresh());
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <>
      {toast && (
        <NotificationToast
          title={toast.title}
          category={toast.category}
          onDismiss={() => setToast(null)}
          onOpen={() => {
            setToast(null);
            router.push("/notifications");
          }}
        />
      )}
      {sheet && (
        <NotificationBottomSheet
          title={sheet.title}
          category={sheet.category}
          distanceMeters={sheet.distance_meters}
          ageLabel={formatIncidentAge(sheet.created_at)}
          verified={sheet.status === "confirmed"}
          onViewOnMap={() => {
            setSheet(null);
            router.push("/");
          }}
          onDismiss={() => setSheet(null)}
        />
      )}
    </>
  );
}
