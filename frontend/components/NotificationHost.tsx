"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, NearbyIncident } from "@pulso/core";
import {
  config,
  decideAlertTier,
  getNearbyIncidents,
  supabase,
  subscribeToNotificationIncidents,
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

// The app-wide notification surface seeds its initial rows before subscribing, then presents
// only genuinely new nearby incidents. Its Realtime channel is intentionally separate from map.
export default function NotificationHost() {
  const router = useRouter();
  const [sheet, setSheet] = useState<NearbyIncident | null>(null);
  const [toast, setToast] = useState<ToastIncident | null>(null);
  const hasSeeded = useRef(false);
  const seenIds = useRef<Set<string>>(new Set());
  const location = useRef({ lat: config.defaultLat, long: config.defaultLng });

  const showIncident = useCallback((incident: NearbyIncident): void => {
    const tier = decideAlertTier({
      severity: incident.severity,
      distanceMeters: incident.distance_meters,
    });

    if (tier === "sheet") {
      setSheet(incident);
      return;
    }

    setToast({ id: incident.id, title: incident.title, category: incident.category });
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    let incidents: NearbyIncident[];
    try {
      incidents = await getNearbyIncidents({
        lat: location.current.lat,
        long: location.current.long,
      });
    } catch {
      return;
    }

    if (!hasSeeded.current) {
      incidents.forEach(({ id }) => seenIds.current.add(id));
      hasSeeded.current = true;
      return;
    }

    incidents.forEach((incident) => {
      if (seenIds.current.has(incident.id)) return;
      seenIds.current.add(incident.id);
      showIncident(incident);
    });
  }, [showIncident]);

  useEffect(() => {
    const channel = subscribeToNotificationIncidents(
      "host",
      () => void refresh(),
    );

    if (!navigator.geolocation) {
      void refresh();
      return () => {
        void supabase.removeChannel(channel);
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        location.current = {
          lat: position.coords.latitude,
          long: position.coords.longitude,
        };
        void refresh();
      },
      () => void refresh(),
    );

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
