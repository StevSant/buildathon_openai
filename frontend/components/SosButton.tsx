"use client";

import { useEffect, useRef, useState } from "react";
import { config, supabase } from "@/lib";

const HOLD_MS = 1200;

// Sends the contract-defined manual SOS payload after a deliberate press-and-hold interaction.
export default function SosButton() {
  const [state, setState] = useState<"idle" | "arming" | "sending" | "sent" | "error">("idle");
  const [dispatched, setDispatched] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function fire(): Promise<void> {
    timer.current = null;
    setState("sending");

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      );
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Missing session");

      const response = await fetch(`${config.functionsUrl}/proximity-dispatcher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "sos",
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        }),
      });
      if (!response.ok) throw new Error(`SOS failed: ${response.status}`);

      const body = (await response.json()) as { dispatched?: unknown };
      const count =
        typeof body.dispatched === "number" && Number.isFinite(body.dispatched)
          ? Math.max(0, Math.trunc(body.dispatched))
          : 0;
      setDispatched(count);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  function startHold(): void {
    if (state === "arming" || state === "sending") return;
    setState("arming");
    timer.current = setTimeout(() => {
      void fire();
    }, HOLD_MS);
  }

  function cancelHold(): void {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setState("idle");
  }

  const title =
    state === "sent"
      ? `Enviado a ${dispatched} ${dispatched === 1 ? "contacto" : "contactos"}`
      : state === "sending"
        ? "Enviando…"
        : state === "error"
          ? "No se pudo enviar"
          : "SOS · Botón de pánico";

  const detail =
    state === "arming"
      ? "Sigue presionando…"
      : state === "sending"
        ? "Enviando tu ubicación…"
        : state === "sent"
          ? "Tu ubicación se envió a tus contactos"
          : state === "error"
            ? "Reintenta manteniendo presionado"
            : "Mantén presionado para enviar tu ubicación a tus contactos";

  return (
    <button
      type="button"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onKeyDown={(event) => {
        if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        startHold();
      }}
      onKeyUp={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        cancelHold();
      }}
      onBlur={cancelHold}
      aria-describedby="sos-instructions"
      className="sosbtn"
    >
      <b>🆘 {title}</b>
      <small id="sos-instructions">{detail}</small>
    </button>
  );
}
