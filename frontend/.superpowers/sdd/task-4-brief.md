### Task 4: Integrate exchanges, compact results, and speaking state

**Files:**
- Modify: `frontend/components/RealtimeAssistant.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: `AssistantConversation`, `AssistantTurnContent`, `AssistantTurn`, `AssistantLocation`, friendly tool labels, existing tool-result envelopes, and `AssistantStatus` including `speaking`.
- Produces: an assistant screen where only the latest exchange is expanded and nearby results show a map plus at most three rows.

- [ ] **Step 1: Replace `RealtimeAssistant.tsx` with the integrated component**

Use this complete file:

```tsx
"use client";

import { useRef, useState } from "react";
import type { IncidentDetails, NearbyIncident } from "@pulso/core";
import {
  startRealtimeSession,
  TOOL_CALL_LABELS,
  type AssistantHandle,
  type AssistantLocation,
  type AssistantStatus,
  type AssistantTurn,
  type AssistantTurnContent,
} from "@/lib";
import AssistantConversation from "./AssistantConversation";

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
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [location, setLocation] = useState<AssistantLocation | null>(null);
  const handle = useRef<AssistantHandle | null>(null);
  const nextExchangeId = useRef(0);
  const currentExchangeId = useRef<number | null>(null);

  function beginExchange(userText?: string) {
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

  function addTurn(turn: AssistantTurnContent) {
    let exchangeId = currentExchangeId.current;
    if (exchangeId === null) {
      exchangeId = nextExchangeId.current + 1;
      nextExchangeId.current = exchangeId;
      currentExchangeId.current = exchangeId;
    }
    setTurns((previousTurns) => [...previousTurns, { ...turn, exchangeId }]);
  }

  async function start(): Promise<AssistantHandle | null> {
    setStatus("connecting");
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
      setLocation(currentLocation);
      handle.current = await startRealtimeSession(personaId, currentLocation, {
        onStatus: setStatus,
        onUserSpeechStarted: () => beginExchange(),
        onUserTranscript: (text) =>
          addTurn({ kind: "text", role: "user", text }),
        onAgentTranscript: (text) =>
          addTurn({ kind: "text", role: "agent", text }),
        onToolCall: (name) =>
          addTurn({
            kind: "text",
            role: "tool",
            text: TOOL_CALL_LABELS[name] ?? `→ ${name}`,
          }),
        onToolResult: (name, result) => {
          const envelope =
            typeof result === "object" && result !== null
              ? (result as Record<string, unknown>)
              : {};
          if (
            name === "get_nearby_incidents" &&
            Array.isArray(envelope.incidents) &&
            envelope.incidents.length > 0
          ) {
            addTurn({
              kind: "incidents",
              incidents: envelope.incidents as NearbyIncident[],
            });
          }
          if (
            name === "get_incident_details" &&
            envelope.found === true &&
            typeof envelope.incident === "object" &&
            envelope.incident !== null
          ) {
            addTurn({
              kind: "detail",
              details: envelope.incident as IncidentDetails,
            });
          }
        },
        onError: () =>
          addTurn({
            kind: "text",
            role: "agent",
            text: "No pude completar esa respuesta. Intenta de nuevo.",
          }),
      });
      return handle.current;
    } catch {
      setStatus("error");
      return null;
    }
  }

  function stop() {
    handle.current?.stop();
    handle.current = null;
    currentExchangeId.current = null;
    setStatus("idle");
  }

  async function ask(question: string) {
    beginExchange(question);
    const current = handle.current ?? (await start());
    current?.sendText(question);
  }

  const live =
    status === "listening" || status === "speaking" || status === "connecting";
  const connected = status === "listening" || status === "speaking";
  const toggle = live ? stop : start;
  const orbLabel = live
    ? "Finalizar conversación con Cerca"
    : "Hablar con Cerca";

  const footer =
    status === "connecting"
      ? "Conectando…"
      : status === "speaking"
        ? "Cerca está respondiendo…"
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
            disabled={status === "connecting" || status === "speaking"}
            onClick={() => void ask(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="convo">
        <AssistantConversation turns={turns} location={location} />
      </div>

      <div className="listening">
        {status === "listening" ? (
          <span className="eq">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
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
```

- [ ] **Step 2: Add compact-map and history styles**

Append these rules to the existing `/* voice */` section in `frontend/app/globals.css`, after the `.icard .more` rule:

```css
.assistant-conversation { display: flex; flex-direction: column; gap: 8px; }
.assistant-turn-list { display: flex; flex-direction: column; gap: 8px; }
.assistant-nearby-result { display: flex; flex-direction: column; gap: 8px; }
.assistant-history { border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--panel) 74%, transparent); overflow: hidden; }
.assistant-history summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 11px; color: var(--muted); font: 600 11px/1.2 var(--sans); }
.assistant-history summary::-webkit-details-marker { display: none; }
.assistant-history summary::before { content: "›"; color: var(--accent); font: 700 16px/1 var(--mono); transition: transform 0.15s ease; }
.assistant-history[open] summary::before { transform: rotate(90deg); }
.assistant-history summary span { margin-left: auto; min-width: 20px; border-radius: 999px; padding: 3px 6px; text-align: center; color: var(--faint); background: var(--panel-2); font: 600 10px/1 var(--mono); }
.assistant-history[open] .assistant-turn-list { padding: 0 10px 10px; }
.assistant-map { position: relative; width: 100%; height: 156px; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--panel-2); }
.assistant-map-user { display: block; width: 13px; height: 13px; border: 2px solid #06120f; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); }
.assistant-map-pin { display: block; width: 12px; height: 12px; border: 2px solid rgba(6, 18, 15, 0.9); border-radius: 50% 50% 50% 2px; transform: rotate(45deg); box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45); }
```

- [ ] **Step 3: Validate types and production compilation**

Run from `frontend/`:

```powershell
npx tsc --noEmit
npx next build
```

Expected: both commands exit 0. The build output lists `/assistant` without compilation or prerender errors.

- [ ] **Step 4: Commit only Task 4 files**

```powershell
git add frontend/components/RealtimeAssistant.tsx frontend/app/globals.css
git commit -m "feat(assistant): show compact latest-turn results"
```

---

