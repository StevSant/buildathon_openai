"use client";

import { useEffect, useState } from "react";

type PermissionState = "unknown" | "granted" | "denied";

// Requests the device permissions used by Pulso from the profile flow. Location is required
// for nearby incidents and SOS; microphone remains optional for the voice assistant.
export default function PermissionsCard() {
  const [locationState, setLocationState] =
    useState<PermissionState>("unknown");
  const [microphoneState, setMicrophoneState] =
    useState<PermissionState>("unknown");

  useEffect(() => {
    if (!navigator.permissions) return;

    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        setLocationState(
          status.state === "granted"
            ? "granted"
            : status.state === "denied"
              ? "denied"
              : "unknown",
        );
      })
      .catch(() => undefined);
  }, []);

  async function requestLocation(): Promise<void> {
    try {
      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
        }),
      );
      setLocationState("granted");
    } catch {
      setLocationState("denied");
    }
  }

  async function requestMicrophone(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophoneState("granted");
    } catch {
      setMicrophoneState("denied");
    }
  }

  const locationAction =
    locationState === "granted" ? (
      <span className="rounded-md bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] px-1.5 py-1 text-[10px] font-semibold uppercase text-ok">
        Concedido
      </span>
    ) : (
      <button
        type="button"
        onClick={() => void requestLocation()}
        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
          locationState === "denied"
            ? "bg-[color-mix(in_srgb,var(--sev-fire)_14%,transparent)] text-sev-fire"
            : "bg-accent text-accent-ink"
        }`}
      >
        {locationState === "denied" ? "Reintentar" : "Permitir"}
      </button>
    );

  const microphoneAction =
    microphoneState === "granted" ? (
      <span className="rounded-md bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] px-1.5 py-1 text-[10px] font-semibold uppercase text-ok">
        Concedido
      </span>
    ) : (
      <button
        type="button"
        onClick={() => void requestMicrophone()}
        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
          microphoneState === "denied"
            ? "bg-[color-mix(in_srgb,var(--sev-fire)_14%,transparent)] text-sev-fire"
            : "bg-accent text-accent-ink"
        }`}
      >
        {microphoneState === "denied" ? "Reintentar" : "Permitir"}
      </button>
    );

  return (
    <section className="rounded-[14px] border border-line bg-panel" aria-labelledby="permissions-title">
      <h2
        id="permissions-title"
        className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint"
      >
        Permisos del dispositivo
      </h2>
      <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-panel-3 text-[15px]">
          &#128205;
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Ubicación · obligatoria</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            Para incidentes cercanos y enviar tu ubicación en un SOS.
          </p>
        </div>
        {locationAction}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-panel-3 text-[15px]">
          &#127908;
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Micrófono · opcional</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            Solo para hablar con el asistente de voz Cerca.
          </p>
        </div>
        {microphoneAction}
      </div>
    </section>
  );
}
