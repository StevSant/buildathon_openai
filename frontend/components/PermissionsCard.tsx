"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

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

  function action(state: PermissionState, request: () => void) {
    if (state === "granted") {
      return (
        <span className="badge-ok">
          <Icon name="ic-check" style={{ width: 14, height: 14, strokeWidth: 2.3 }} />
          Activada
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={request}
        className={state === "denied" ? "btn ghost sm" : "btn primary sm"}
        style={{ width: "auto", flex: "none", ...(state === "denied" ? { color: "var(--sev-fire)" } : {}) }}
      >
        {state === "denied" ? "Reintentar" : "Permitir"}
      </button>
    );
  }

  return (
    <section className="group" aria-labelledby="permissions-title">
      <div className="gl" id="permissions-title">
        Permisos
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "4px 13px 13px",
        }}
      >
        <div className="perm-row" style={{ alignItems: "center" }}>
          <span className="pi">
            <Icon name="ic-target" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pt">Ubicación · obligatoria</div>
            <div className="pd">Para incidentes cercanos y enviar tu ubicación en un SOS.</div>
          </div>
          {action(locationState, () => void requestLocation())}
        </div>

        <div className="perm-row" style={{ alignItems: "center" }}>
          <span className="pi">
            <Icon name="ic-mic" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pt">Micrófono · opcional</div>
            <div className="pd">Solo para hablar con el asistente de voz Cerca.</div>
          </div>
          {action(microphoneState, () => void requestMicrophone())}
        </div>
      </div>
    </section>
  );
}
