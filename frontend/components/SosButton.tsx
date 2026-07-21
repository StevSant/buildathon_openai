"use client";

import { useRef, useState } from "react";
import { supabase, config } from "@/lib";

// Manual panic button. Press-and-hold to send the user's current location to their
// accepted emergency contacts via the proximity-dispatcher function (manual-SOS payload).
const HOLD_MS = 1200;

export default function SosButton() {
  const [state, setState] = useState<"idle" | "arming" | "sending" | "sent" | "error">(
    "idle",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fire() {
    setState("sending");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      );
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      const res = await fetch(`${config.functionsUrl}/proximity-dispatcher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // CONTRACT §4: manual-SOS payload { type: 'sos', location: { lat, lng } }.
        body: JSON.stringify({
          type: "sos",
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        }),
      });
      if (!res.ok) throw new Error(`SOS falló: ${res.status}`);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  function startHold() {
    setState("arming");
    timer.current = setTimeout(fire, HOLD_MS);
  }

  function cancelHold() {
    if (timer.current) clearTimeout(timer.current);
    if (state === "arming") setState("idle");
  }

  const label =
    state === "sent"
      ? "Ubicación enviada"
      : state === "sending"
        ? "Enviando…"
        : state === "error"
          ? "No se pudo enviar — reintenta"
          : "SOS · Botón de pánico";

  return (
    <button
      type="button"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      className="mt-1 flex w-full flex-col items-center gap-1 rounded-2xl border-0 bg-gradient-to-b from-[#FF6B6B] to-[#DE2A2A] px-3 py-3.5 text-white shadow-[0_12px_30px_-12px_#ff4d4d]"
    >
      <b className="text-[15px] font-extrabold tracking-wide">🆘 {label}</b>
      <small className="text-[10.5px] font-medium opacity-90">
        Mantén presionado para enviar tu ubicación a tus contactos
      </small>
    </button>
  );
}
