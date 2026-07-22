"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CATEGORY_VALUES, INCIDENT_STATUS_LABELS } from "@pulso/core";
import {
  getNearbyIncidents,
  startRealtimeSession,
  TOOL_CALL_LABELS,
  type AssistantHandle,
  type AssistantIncidentDetails,
  type AssistantLocation,
  type AssistantStatus,
  type AssistantTurn,
  type AssistantTurnContent,
} from "@/lib";
import AssistantConversation from "./AssistantConversation";

function isAssistantIncidentDetails(
  value: unknown,
): value is AssistantIncidentDetails {
  if (typeof value !== "object" || value === null) return false;
  const details = value as Record<string, unknown>;
  return (
    typeof details.id === "string" &&
    typeof details.title === "string" &&
    (typeof details.description === "string" || details.description === null) &&
    typeof details.category === "string" &&
    CATEGORY_VALUES.includes(details.category as (typeof CATEGORY_VALUES)[number]) &&
    typeof details.severity === "number" &&
    Number.isInteger(details.severity) &&
    details.severity >= 1 &&
    details.severity <= 5 &&
    typeof details.status === "string" &&
    Object.prototype.hasOwnProperty.call(INCIDENT_STATUS_LABELS, details.status) &&
    typeof details.confirmations === "number" &&
    typeof details.disputes === "number" &&
    typeof details.reporter_verified === "boolean" &&
    typeof details.created_at === "string" &&
    (typeof details.photo_path === "string" || details.photo_path === null)
  );
}

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
  personaId?: "cerca" | "ruta";
}) {
  const [status, setStatus] = useState<AssistantStatus | "idle">("idle");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [location, setLocation] = useState<AssistantLocation | null>(null);
  const handle = useRef<AssistantHandle | null>(null);
  // Synchronous guards (React state updates are not): `starting` deduplicates concurrent
  // start() calls so rapid taps can never open two sessions (orphaning a live mic), and
  // `generation` invalidates a connect that finishes after the user already hit stop.
  const starting = useRef<Promise<AssistantHandle | null> | null>(null);
  const connectionAbort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const nextExchangeId = useRef(0);
  const currentExchangeId = useRef<number | null>(null);
  const exchangeBusyRef = useRef(false);
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const voiceTurnActiveRef = useRef(false);
  const [voiceTurnActive, setVoiceTurnActive] = useState(false);
  const conversationEnd = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      generation.current += 1;
      starting.current = null;
      connectionAbort.current?.abort();
      connectionAbort.current = null;
      const activeHandle = handle.current;
      handle.current = null;
      activeHandle?.stop();
    },
    [],
  );

  useEffect(() => {
    const end = conversationEnd.current;
    if (!end || turns.length === 0) return;
    const conversation = end.closest(".convo");
    if (conversation?.querySelector(".assistant-history[open]")) return;
    end.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  useEffect(() => {
    function finishTurnOnFocusLoss() {
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        finishVoiceTurn();
      }
    }

    window.addEventListener("blur", finishTurnOnFocusLoss);
    document.addEventListener("visibilitychange", finishTurnOnFocusLoss);
    return () => {
      window.removeEventListener("blur", finishTurnOnFocusLoss);
      document.removeEventListener("visibilitychange", finishTurnOnFocusLoss);
    };
  }, []);

  function updateExchangeBusy(busy: boolean) {
    exchangeBusyRef.current = busy;
    setExchangeBusy(busy);
  }

  function updateSessionStatus(nextStatus: AssistantStatus) {
    setStatus(nextStatus);
    if (
      nextStatus === "ready" ||
      nextStatus === "error" ||
      nextStatus === "closed"
    ) {
      voiceTurnActiveRef.current = false;
      setVoiceTurnActive(false);
      updateExchangeBusy(false);
      return;
    }
    if (
      nextStatus === "connecting" ||
      nextStatus === "listening" ||
      nextStatus === "speaking"
    ) {
      updateExchangeBusy(true);
    }
  }

  function openExchange(userText?: string) {
    const exchangeId = nextExchangeId.current + 1;
    nextExchangeId.current = exchangeId;
    currentExchangeId.current = exchangeId;
    if (userText) {
      setTurns((previousTurns) => [
        ...previousTurns,
        { exchangeId, kind: "text", role: "user", text: userText },
      ]);
    }
  }

  function beginExchange(userText?: string): boolean {
    if (exchangeBusyRef.current) return false;
    updateExchangeBusy(true);
    openExchange(userText);
    return true;
  }

  function addTurn(turn: AssistantTurnContent, targetExchangeId?: number) {
    let exchangeId = targetExchangeId ?? currentExchangeId.current;
    if (exchangeId === null) {
      exchangeId = nextExchangeId.current + 1;
      nextExchangeId.current = exchangeId;
      currentExchangeId.current = exchangeId;
    }
    setTurns((previousTurns) => [...previousTurns, { ...turn, exchangeId }]);
  }

  function start(): Promise<AssistantHandle | null> {
    if (handle.current) return Promise.resolve(handle.current);
    if (starting.current) return starting.current;
    const sessionGeneration = generation.current;
    const abortController = new AbortController();
    connectionAbort.current = abortController;
    updateSessionStatus("connecting");
    const startPromise = connect(sessionGeneration, abortController.signal);
    starting.current = startPromise;
    void startPromise.finally(() => {
      if (starting.current === startPromise) starting.current = null;
      if (connectionAbort.current === abortController) {
        connectionAbort.current = null;
      }
    });
    return startPromise;
  }

  async function connect(
    sessionGeneration: number,
    signal: AbortSignal,
  ): Promise<AssistantHandle | null> {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
        }),
      );
      const currentLocation = {
        lat: position.coords.latitude,
        long: position.coords.longitude,
      };
      if (generation.current !== sessionGeneration) return null;
      setLocation(currentLocation);
      let readyBeforeHandle = false;
      const session = await startRealtimeSession(
        personaId,
        currentLocation,
        {
          onStatus: (nextStatus) => {
            if (generation.current !== sessionGeneration) return;
            if (nextStatus === "closed") handle.current = null;
            // The data channel can open before startRealtimeSession returns its handle.
            // Keep the UI connecting until the handle is actually usable.
            if (nextStatus === "ready" && handle.current === null) {
              readyBeforeHandle = true;
              return;
            }
            updateSessionStatus(nextStatus);
          },
          onUserTranscript: (text) => {
            if (generation.current !== sessionGeneration) return;
            addTurn({ kind: "text", role: "user", text });
          },
          onAgentTranscript: (text) => {
            if (generation.current !== sessionGeneration) return;
            addTurn({ kind: "text", role: "agent", text });
          },
          onToolCall: (name) => {
            if (generation.current !== sessionGeneration) return;
            addTurn({
              kind: "text",
              role: "tool",
              text: TOOL_CALL_LABELS[name] ?? `→ ${name}`,
            });
          },
          // The speak-ready agent envelopes intentionally omit coordinates. Nearby results
          // are enriched through the browser RPC before the map receives them.
          onToolResult: (name, result, toolArgs) => {
            if (generation.current !== sessionGeneration) return;
            const envelope =
              typeof result === "object" && result !== null
                ? (result as Record<string, unknown>)
                : {};
            if (
              name === "get_nearby_incidents" &&
              Array.isArray(envelope.incidents) &&
              envelope.incidents.length > 0
            ) {
              const incidentIds = envelope.incidents.flatMap((incident) =>
                typeof incident === "object" &&
                incident !== null &&
                typeof (incident as Record<string, unknown>).id === "string"
                  ? [(incident as Record<string, unknown>).id as string]
                  : [],
              );
              const exchangeId = currentExchangeId.current;
              if (exchangeId !== null && incidentIds.length > 0) {
                const radiusMeters =
                  typeof toolArgs.radius_meters === "number" &&
                  Number.isFinite(toolArgs.radius_meters) &&
                  toolArgs.radius_meters > 0
                    ? toolArgs.radius_meters
                    : undefined;
                const category =
                  typeof toolArgs.filter_category === "string" &&
                  CATEGORY_VALUES.includes(
                    toolArgs.filter_category as (typeof CATEGORY_VALUES)[number],
                  )
                    ? (toolArgs.filter_category as (typeof CATEGORY_VALUES)[number])
                    : null;
                const showMapFallback = () => {
                  if (generation.current !== sessionGeneration) return;
                  addTurn(
                    {
                      kind: "text",
                      role: "tool",
                      text: "No pude cargar el mapa de estos incidentes.",
                    },
                    exchangeId,
                  );
                };
                void getNearbyIncidents({
                  lat: currentLocation.lat,
                  long: currentLocation.long,
                  radiusMeters,
                  category,
                })
                  .then((nearbyIncidents) => {
                    if (generation.current !== sessionGeneration) return;
                    const byId = new Map(
                      nearbyIncidents
                        .filter(
                          (incident) =>
                            Number.isFinite(incident.lat) &&
                            Number.isFinite(incident.lng) &&
                            CATEGORY_VALUES.includes(incident.category) &&
                            Object.prototype.hasOwnProperty.call(
                              INCIDENT_STATUS_LABELS,
                              incident.status,
                            ),
                        )
                        .map((incident) => [incident.id, incident]),
                    );
                    const incidents = incidentIds.flatMap((id) => {
                      const incident = byId.get(id);
                      return incident ? [incident] : [];
                    });
                    if (incidents.length > 0) {
                      addTurn({ kind: "incidents", incidents }, exchangeId);
                    } else {
                      showMapFallback();
                    }
                  })
                  .catch(showMapFallback);
              }
            }
            if (
              name === "get_incident_details" &&
              envelope.found === true &&
              isAssistantIncidentDetails(envelope.incident)
            ) {
              addTurn({ kind: "detail", details: envelope.incident });
            }
          },
          onError: () => {
            if (generation.current !== sessionGeneration) return;
            addTurn({
              kind: "text",
              role: "agent",
              text: "No pude completar esa respuesta. Intenta de nuevo.",
            });
          },
        },
        signal,
      );
      if (generation.current !== sessionGeneration) {
        // The user hit stop while we were connecting — discard the fresh session.
        session.stop();
        return null;
      }
      handle.current = session;
      if (readyBeforeHandle) updateSessionStatus("ready");
      return session;
    } catch {
      if (generation.current === sessionGeneration) updateSessionStatus("error");
      return null;
    }
  }

  function stop() {
    generation.current += 1;
    starting.current = null;
    connectionAbort.current?.abort();
    connectionAbort.current = null;
    handle.current?.stop();
    handle.current = null;
    currentExchangeId.current = null;
    voiceTurnActiveRef.current = false;
    setVoiceTurnActive(false);
    updateExchangeBusy(false);
    setStatus("idle");
  }

  function startVoiceTurn(): boolean {
    if (
      (status !== "ready" && status !== "speaking") ||
      voiceTurnActiveRef.current
    ) {
      return false;
    }
    const session = handle.current;
    if (!session?.startVoiceTurn()) return false;

    voiceTurnActiveRef.current = true;
    setVoiceTurnActive(true);
    openExchange();
    return true;
  }

  function finishVoiceTurn() {
    if (!voiceTurnActiveRef.current) return;
    voiceTurnActiveRef.current = false;
    setVoiceTurnActive(false);
    handle.current?.finishVoiceTurn();
  }

  function handleOrbPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !startVoiceTurn()) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleOrbPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!voiceTurnActiveRef.current) return;
    event.preventDefault();
    finishVoiceTurn();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleOrbKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    startVoiceTurn();
  }

  function handleOrbKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    finishVoiceTurn();
  }

  async function ask(question: string) {
    if (!beginExchange(question)) return;
    const questionGeneration = generation.current;
    const session = handle.current ?? (await start());
    if (generation.current !== questionGeneration || !session) return;
    updateExchangeBusy(true);
    session.sendText(question);
  }

  // The session remains live while the microphone stays closed between intentional turns.
  const live =
    status === "ready" ||
    status === "listening" ||
    status === "speaking" ||
    status === "connecting";
  const connected =
    status === "ready" || status === "listening" || status === "speaking";

  const toggle = live ? stop : start;
  const orbLabel =
    status === "listening"
      ? "Suelta para enviar tu mensaje a Cerca"
      : connected
        ? "Mantén presionado para hablar con Cerca"
        : "Conecta con Cerca para hablar";

  const footer =
    status === "connecting"
      ? "Conectando…"
      : status === "speaking"
        ? "Cerca está respondiendo…"
        : status === "listening"
          ? "Te escucho… suelta el orbe para enviar"
          : status === "ready"
            ? "Mantén presionado el orbe para hablar"
            : status === "error"
              ? "Error de conexión — toca Reintentar"
              : "Inicia la conversación para hablar";

  const buttonLabel =
    status === "connecting"
      ? "Cancelar conexión"
      : connected
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
          disabled={!connected}
          onPointerDown={handleOrbPointerDown}
          onPointerUp={handleOrbPointerEnd}
          onPointerCancel={handleOrbPointerEnd}
          onLostPointerCapture={handleOrbPointerEnd}
          onKeyDown={handleOrbKeyDown}
          onKeyUp={handleOrbKeyUp}
          onBlur={finishVoiceTurn}
          aria-label={orbLabel}
          aria-pressed={voiceTurnActive}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
          }}
        />
      </div>

      <div className="suggs" aria-label="Preguntas sugeridas">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={exchangeBusy}
            onClick={() => void ask(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="convo">
        <AssistantConversation turns={turns} location={location} />
        <div ref={conversationEnd} aria-hidden="true" />
      </div>

      <div className="listening" role="status" aria-live="polite">
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
