"use client";

import { useRef, useState } from "react";
import type { IncidentDetails, NearbyIncident } from "@pulso/core";
import {
  startRealtimeSession,
  TOOL_CALL_LABELS,
  type AssistantHandle,
  type AssistantStatus,
} from "@/lib";
import AssistantIncidentCards from "./AssistantIncidentCards";
import AssistantIncidentDetailCard from "./AssistantIncidentDetailCard";

// Voice agent "Cerca". Establishes the WebRTC session and surfaces a live conversation
// while the agent queries real incident data through the browser tool bridge. Tool
// results also render as rich cards (photos, distances, confirmations) below the audio
// transcript, so the user sees the evidence behind what Cerca says.
type Turn =
  | { kind: "text"; role: "user" | "agent" | "tool"; text: string }
  | { kind: "incidents"; incidents: NearbyIncident[] }
  | { kind: "detail"; details: IncidentDetails };

// Aligned with the agent tools: nearby query, severity focus, category filters, and the
// trust question that makes Cerca cite its community sources.
const SUGGESTED_QUESTIONS = [
  "¿Qué pasa cerca de mí?",
  "¿Hay algo grave ahora?",
  "¿Inundaciones en mi zona?",
  "¿Cómo están las vías?",
  "¿Cómo sé que es real?",
];

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

  async function start(): Promise<AssistantHandle | null> {
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
          onUserTranscript: (text) => addTurn({ kind: "text", role: "user", text }),
          onAgentTranscript: (text) => addTurn({ kind: "text", role: "agent", text }),
          onToolCall: (name) => addTurn({ kind: "text", role: "tool", text: `→ ${name}` }),
          onToolResult: (name, result) => {
            if (name === "get_nearby_incidents" && Array.isArray(result) && result.length > 0) {
              addTurn({ kind: "incidents", incidents: result as NearbyIncident[] });
            }
            if (
              name === "get_incident_details" &&
              typeof result === "object" &&
              result !== null &&
              "id" in result
            ) {
              addTurn({ kind: "detail", details: result as IncidentDetails });
            }
          },
        },
      );
      return handle.current;
    } catch {
      setStatus("error");
      return null;
    }
  }

  function stop() {
    handle.current?.stop();
    handle.current = null;
    setStatus("idle");
  }

  // Tapping a chip works in any state: it starts the session first when needed (the
  // bridge queues the question until the data channel opens) and asks right away.
  async function ask(question: string) {
    addTurn({ kind: "text", role: "user", text: question });
    const current = handle.current ?? (await start());
    current?.sendText(question);
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

      <div className="suggs" aria-label="Preguntas sugeridas">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={status === "connecting"}
            onClick={() => void ask(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="convo">
        {turns.map((turn, index) => {
          if (turn.kind === "incidents") {
            return <AssistantIncidentCards key={index} incidents={turn.incidents} />;
          }
          if (turn.kind === "detail") {
            return <AssistantIncidentDetailCard key={index} details={turn.details} />;
          }
          return turn.role === "tool" ? (
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
          );
        })}
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
