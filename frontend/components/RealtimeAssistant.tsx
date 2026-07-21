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

  const live = status === "listening" || status === "connecting";

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-5 pb-3 pt-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-panel-2 text-[13px] shadow-[0_0_14px_-3px_var(--accent)]">
          <span aria-hidden="true">✦</span>
          <span className="absolute h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <div className="text-[16px] font-bold tracking-[-0.02em]">Cerca</div>
        {status === "listening" && (
          <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ok">
            <b className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_var(--ok)]" />
            En vivo
          </div>
        )}
      </div>

      <div className="relative flex justify-center py-4">
        <div
          className={`absolute top-1/2 h-[184px] w-[184px] -translate-y-1/2 rounded-full border-2 border-[color-mix(in_srgb,var(--accent)_52%,transparent)] ${
            live ? "animate-pulse" : "opacity-35"
          }`}
        />
        <div
          className={`absolute top-1/2 h-[150px] w-[150px] -translate-y-1/2 rounded-full border border-[color-mix(in_srgb,var(--accent)_36%,transparent)] ${
            live ? "animate-pulse" : "opacity-25"
          }`}
        />
        <div
          className={`relative h-[100px] w-[100px] rounded-full border-2 border-[color-mix(in_srgb,#94ffed_65%,transparent)] bg-[radial-gradient(circle_at_40%_32%,#9cfff0_0%,#4be4ca_35%,var(--accent-deep)_72%,#087361_100%)] shadow-[0_0_32px_4px_color-mix(in_srgb,var(--accent)_50%,transparent)] ${
            live ? "animate-pulse" : "opacity-70"
          }`}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
        {turns.length === 0 && (
          <p className="mx-auto max-w-[245px] rounded-[14px] bg-panel-2 px-3 py-2 text-center text-[12px] leading-relaxed text-muted">
            Pregúntame qué está pasando cerca de ti. Consultaré incidentes reales de Pulso.
          </p>
        )}
        {turns.map((turn, index) =>
          turn.role === "tool" ? (
            <div
              key={index}
              className="self-start rounded-md border border-dashed px-2.5 py-1.5 font-mono text-[10.5px] font-semibold text-accent"
              style={{
                background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
              }}
            >
              {turn.text}
            </div>
          ) : (
            <div
              key={index}
              className={`max-w-[88%] rounded-[13px] px-3 py-2 text-[12.5px] leading-relaxed shadow-[0_6px_18px_-14px_black] ${
                turn.role === "user"
                  ? "self-end bg-panel-3 text-ink"
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
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-[13px] px-3 py-3 text-sm font-bold transition-colors ${
          live
            ? "border border-line bg-panel-2 text-ink"
            : "bg-accent text-accent-ink shadow-[0_8px_24px_-10px_var(--accent)]"
        }`}
      >
        {status === "listening" && (
          <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
            <i className="h-2 w-[2px] rounded-full bg-accent" />
            <i className="h-4 w-[2px] rounded-full bg-accent" />
            <i className="h-2.5 w-[2px] rounded-full bg-accent" />
          </span>
        )}
        {status === "connecting"
          ? "Conectando…"
          : live
            ? "Finalizar conversación"
            : status === "error"
              ? "Error — reintentar"
              : "Hablar con Cerca"}
      </button>
    </div>
  );
}
