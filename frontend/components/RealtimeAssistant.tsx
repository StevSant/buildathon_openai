"use client";

import { useRef, useState } from "react";
import {
  startRealtimeSession,
  type AssistantHandle,
  type AssistantStatus,
} from "@/lib";

// Voice agent "Cerca". Establishes the WebRTC session and surfaces a live conversation
// while the agent queries real incident data through the browser tool bridge.
interface Turn {
  role: "user" | "agent" | "tool";
  text: string;
}

export default function RealtimeAssistant({
  personaId = "cerca",
}: {
  personaId?: string;
}) {
  const [status, setStatus] = useState<AssistantStatus | "idle">("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const handle = useRef<AssistantHandle | null>(null);

  function addTurn(turn: Turn) {
    setTurns((previousTurns) => [...previousTurns, turn]);
  }

  async function start() {
    setStatus("connecting");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
        }),
      );
      handle.current = await startRealtimeSession(
        personaId,
        { lat: position.coords.latitude, long: position.coords.longitude },
        {
          onStatus: setStatus,
          onUserTranscript: (text) => addTurn({ role: "user", text }),
          onAgentTranscript: (text) => addTurn({ role: "agent", text }),
          onToolCall: (name) => addTurn({ role: "tool", text: `→ ${name}` }),
        },
      );
    } catch {
      setStatus("error");
    }
  }

  function stop() {
    handle.current?.stop();
    handle.current = null;
    setStatus("idle");
  }

  // A live session is either dialing in or streaming; the badge only reads "EN VIVO"
  // once audio is actually flowing (listening), while the orb pulses through both phases.
  const live = status === "listening" || status === "connecting";
  const connected = status === "listening";

  const toggle = live ? stop : start;
  const orbLabel = live ? "Finalizar conversación con Cerca" : "Hablar con Cerca";

  const footer =
    status === "connecting"
      ? "Conectando…"
      : status === "listening"
        ? "Escuchando…"
        : status === "error"
          ? "Error de conexión — toca el orbe para reintentar"
          : "Toca el orbe para hablar";

  const buttonLabel = live
    ? "Finalizar conversación"
    : status === "error"
      ? "Reintentar"
      : "Hablar con Cerca";

  return (
    <div className="s-voice">
      <div className="who">
        <span className="lg">
          <svg viewBox="0 0 512 512">
            <use href="#logo" />
          </svg>
        </span>
        <span className="nm">Cerca</span>
        {connected ? (
          <span className="st">
            <b />
            EN VIVO
          </span>
        ) : (
          <span className="st" style={{ color: "var(--faint)" }}>
            <b style={{ background: "var(--faint)", boxShadow: "none" }} />
            DESCONECTADO
          </span>
        )}
      </div>

      <div className="orb-wrap">
        <button
          type="button"
          className={live ? "orb" : "orb idle"}
          onClick={toggle}
          aria-label={orbLabel}
          style={{ appearance: "none", WebkitAppearance: "none" }}
        />
      </div>

      <div className="convo">
        {turns.map((turn, index) =>
          turn.role === "tool" ? (
            <div key={index} className="toolcall">
              {turn.text}
            </div>
          ) : (
            <div
              key={index}
              className={turn.role === "user" ? "bubble u" : "bubble a"}
            >
              {turn.text}
            </div>
          ),
        )}
      </div>

      <div className="listening">
        {status === "listening" && (
          <span className="eq">
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        {footer}
      </div>

      <button
        type="button"
        onClick={toggle}
        className={live ? "btn ghost" : "btn primary"}
        style={{ marginTop: 10 }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
