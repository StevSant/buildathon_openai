"use client";

import { useRef, useState } from "react";
import {
  startRealtimeSession,
  type AssistantHandle,
  type AssistantStatus,
} from "@/lib";

// Voice agent "Cerca". Establishes the WebRTC session (via lib/realtime-agent), shows the
// live status + a running transcript, and surfaces tool-call chips as the agent queries
// real data. It never invents incidents — answers come from the bridged tools.
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
    setTurns((prev) => [...prev, turn]);
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

  const live = status === "listening" || status === "connecting";

  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      <div className="mb-1 flex items-center gap-2.5">
        <div className="text-[15px] font-bold">Cerca</div>
        {status === "listening" && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ok">
            <b className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_var(--ok)]" />
            En vivo
          </div>
        )}
      </div>

      <div className="flex justify-center py-3">
        <div
          className={`h-[100px] w-[100px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#7ff0dc,var(--accent)_45%,var(--accent-deep)_100%)] shadow-[0_0_44px_-4px_var(--accent)] ${
            live ? "animate-pulse" : "opacity-70"
          }`}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-center text-[12px] text-muted">
            Habla con “Cerca”. Responde con datos reales vía tools — nunca inventa.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.role === "tool" ? (
            <div
              key={i}
              className="self-start rounded-lg border border-dashed px-2.5 py-1.5 font-mono text-[10.5px] text-accent"
              style={{
                background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
              }}
            >
              {turn.text}
            </div>
          ) : (
            <div
              key={i}
              className={`max-w-[88%] rounded-[14px] px-3 py-2 text-[12.5px] ${
                turn.role === "user"
                  ? "self-end bg-panel-3"
                  : "self-start border border-line bg-panel"
              }`}
            >
              {turn.text}
            </div>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={live ? stop : start}
        className={`mt-3 flex w-full items-center justify-center rounded-[14px] px-3 py-3 text-sm font-bold ${
          live
            ? "border border-line bg-panel-2 text-ink"
            : "bg-accent text-accent-ink"
        }`}
      >
        {status === "connecting"
          ? "Conectando…"
          : live
            ? "Terminar"
            : status === "error"
              ? "Error — reintentar"
              : "Hablar con Cerca"}
      </button>
    </div>
  );
}
