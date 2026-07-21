# Compact Cerca Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cerca's long, repeating transcript with a compact incident map, an always-visible latest exchange, collapsed history, brief responses, and stable half-duplex voice turns.

**Architecture:** The Realtime bridge keeps server VAD for speech boundaries but disables automatic responses, creates every response with concise per-turn guidance, and gates the microphone while the assistant responds. Structured tool results are tagged with an exchange id and rendered by focused conversation components; nearby rows feed a read-only MapLibre preview and the existing three-row evidence card.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.6, OpenAI Realtime over WebRTC, MapLibre GL, `react-map-gl`, Supabase browser client.

## Global Constraints

- Edit only `frontend/**`; do not modify backend files, migrations, `plans/CONTRACT.md`, the root `package.json`, or the root `tsconfig.base.json`.
- Work only on branch `feat/frontend-lane` and preserve unrelated work already present.
- User-facing copy must be Spanish appropriate for Ecuador; code, comments, and commit messages must be English.
- Import types only from `@pulso/core` with `import type`.
- Do not add or hardcode URLs, API keys, coordinates, radii, thresholds, or environment configuration.
- Import application modules through `frontend/lib/index.ts` and `frontend/components/index.ts`; the orchestrator alone wires these barrels.
- Preserve the current speak-ready tool envelopes (`{ incidents }`, `{ found, incident }`), friendly tool labels, typed-question queue, rich incident cards, and `decorateAgentToolResult` flow.
- ADR-015 prohibits adding automated tests. Every task uses `npx tsc --noEmit`, `npx next build`, and focused manual checks instead.
- Stage and commit only the frontend files named by the task. Leave unrelated dirty files unstaged.

---

### Task 1: Conversation DTOs and compact incident map

**Files:**
- Create: `frontend/lib/assistant-conversation.ts`
- Create: `frontend/components/AssistantIncidentMap.tsx`
- Modify: `frontend/lib/index.ts`
- Modify: `frontend/components/index.ts`

**Interfaces:**
- Consumes: `NearbyIncident` and `IncidentDetails` types from `@pulso/core`; `config.mapStyleUrl` and `config.defaultZoom` from `@/lib`.
- Produces: `AssistantLocation`, `AssistantTurnContent`, `AssistantTurn`; `AssistantIncidentMap({ incidents, center })`.

- [ ] **Step 1: Add the conversation DTO file**

Create `frontend/lib/assistant-conversation.ts` with exactly:

```ts
import type { IncidentDetails, NearbyIncident } from "@pulso/core";

export interface AssistantLocation {
  lat: number;
  long: number;
}

export type AssistantTurnContent =
  | { kind: "text"; role: "user" | "agent" | "tool"; text: string }
  | { kind: "incidents"; incidents: NearbyIncident[] }
  | { kind: "detail"; details: IncidentDetails };

export type AssistantTurn = AssistantTurnContent & {
  exchangeId: number;
};
```

- [ ] **Step 2: Add the compact map**

Create `frontend/components/AssistantIncidentMap.tsx` with exactly:

```tsx
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Category, NearbyIncident } from "@pulso/core";
import { config, type AssistantLocation } from "@/lib";

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

export default function AssistantIncidentMap({
  incidents,
  center,
}: {
  incidents: NearbyIncident[];
  center: AssistantLocation;
}) {
  return (
    <div
      className="assistant-map"
      role="img"
      aria-label={`Mapa compacto con ${incidents.length} ${
        incidents.length === 1 ? "incidente cercano" : "incidentes cercanos"
      }`}
    >
      <Map
        reuseMaps
        interactive={false}
        attributionControl={false}
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: center.lat,
          longitude: center.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={center.lat} longitude={center.long} anchor="center">
          <span className="assistant-map-user" aria-hidden="true" />
        </Marker>

        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            latitude={incident.lat}
            longitude={incident.lng}
            anchor="bottom"
          >
            <span
              className="assistant-map-pin"
              aria-hidden="true"
              style={{ background: CATEGORY_COLOR[incident.category] }}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}
```

- [ ] **Step 3: Wire the orchestrator-owned barrels**

Add to `frontend/lib/index.ts` after the Realtime exports:

```ts
export type {
  AssistantLocation,
  AssistantTurn,
  AssistantTurnContent,
} from "./assistant-conversation";
```

Keep exactly one `TOOL_CALL_LABELS` export. Preserve whichever friendly-label module is present in the latest working tree and remove only a duplicate export if concurrent work left both `./tool-labels` and `./tool-call-labels` exported.

Add to `frontend/components/index.ts` beside the existing assistant exports:

```ts
export { default as AssistantIncidentMap } from "./AssistantIncidentMap";
```

- [ ] **Step 4: Validate the focused deliverable**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0; `AssistantIncidentMap` resolves from `@/components`, and all conversation types resolve from `@/lib`.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add frontend/lib/assistant-conversation.ts frontend/components/AssistantIncidentMap.tsx frontend/lib/index.ts frontend/components/index.ts
git commit -m "feat(assistant): add compact incident map primitives"
```

---

### Task 2: Latest-exchange renderer with collapsed history

**Files:**
- Create: `frontend/components/AssistantTurnList.tsx`
- Create: `frontend/components/AssistantConversation.tsx`
- Modify: `frontend/components/index.ts`

**Interfaces:**
- Consumes: `AssistantTurn[]`, `AssistantLocation | null`, `AssistantIncidentMap`, `AssistantIncidentCards`, and `AssistantIncidentDetailCard`.
- Produces: `AssistantTurnList({ turns, location })`; `AssistantConversation({ turns, location })`.

- [ ] **Step 1: Add the focused turn renderer**

Create `frontend/components/AssistantTurnList.tsx` with exactly:

```tsx
"use client";

import type { AssistantLocation, AssistantTurn } from "@/lib";
import AssistantIncidentCards from "./AssistantIncidentCards";
import AssistantIncidentDetailCard from "./AssistantIncidentDetailCard";
import AssistantIncidentMap from "./AssistantIncidentMap";

export default function AssistantTurnList({
  turns,
  location,
}: {
  turns: AssistantTurn[];
  location: AssistantLocation | null;
}) {
  return (
    <div className="assistant-turn-list">
      {turns.map((turn, index) => {
        const key = `${turn.exchangeId}-${index}`;
        if (turn.kind === "incidents") {
          return (
            <div key={key} className="assistant-nearby-result">
              {location ? (
                <AssistantIncidentMap incidents={turn.incidents} center={location} />
              ) : null}
              <AssistantIncidentCards incidents={turn.incidents} />
            </div>
          );
        }
        if (turn.kind === "detail") {
          return <AssistantIncidentDetailCard key={key} details={turn.details} />;
        }
        if (turn.role === "tool") {
          return (
            <div key={key} className="toolcall">
              {turn.text}
            </div>
          );
        }
        return (
          <div key={key} className={turn.role === "user" ? "bubble u" : "bubble a"}>
            {turn.text}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the history boundary**

Create `frontend/components/AssistantConversation.tsx` with exactly:

```tsx
"use client";

import type { AssistantLocation, AssistantTurn } from "@/lib";
import AssistantTurnList from "./AssistantTurnList";

export default function AssistantConversation({
  turns,
  location,
}: {
  turns: AssistantTurn[];
  location: AssistantLocation | null;
}) {
  const latestExchangeId = turns.at(-1)?.exchangeId;
  const previousTurns = turns.filter((turn) => turn.exchangeId !== latestExchangeId);
  const latestTurns = turns.filter((turn) => turn.exchangeId === latestExchangeId);
  const previousCount = new Set(previousTurns.map((turn) => turn.exchangeId)).size;

  return (
    <div className="assistant-conversation">
      {previousTurns.length > 0 ? (
        <details className="assistant-history">
          <summary>
            Ver conversación anterior
            <span>{previousCount}</span>
          </summary>
          <AssistantTurnList turns={previousTurns} location={location} />
        </details>
      ) : null}

      <AssistantTurnList turns={latestTurns} location={location} />
    </div>
  );
}
```

- [ ] **Step 3: Wire the component barrel**

Add to `frontend/components/index.ts` beside the assistant exports:

```ts
export { default as AssistantTurnList } from "./AssistantTurnList";
export { default as AssistantConversation } from "./AssistantConversation";
```

- [ ] **Step 4: Validate the focused deliverable**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0; the history wrapper accepts empty turns and renders the latest exchange without optional-property errors.

- [ ] **Step 5: Commit only Task 2 files**

```powershell
git add frontend/components/AssistantTurnList.tsx frontend/components/AssistantConversation.tsx frontend/components/index.ts
git commit -m "feat(assistant): collapse previous voice exchanges"
```

---

### Task 3: Controlled Realtime responses and acoustic isolation

**Files:**
- Modify: `frontend/lib/realtime-agent.ts`

**Interfaces:**
- Consumes: the existing client-secret mint, tool bridge, tool-result decorator, typed-question queue, and WebRTC data channel.
- Produces: `AssistantStatus` including `speaking`; `AssistantCallbacks.onUserSpeechStarted`; brief client-created responses; a microphone track disabled only while a response is active.

- [ ] **Step 1: Extend status and callbacks**

Replace the current `AssistantStatus` and `AssistantCallbacks` declarations with:

```ts
export type AssistantStatus =
  | "connecting"
  | "listening"
  | "speaking"
  | "error"
  | "closed";

export interface AssistantCallbacks {
  onStatus?: (status: AssistantStatus) => void;
  onUserSpeechStarted?: () => void;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
  onToolCall?: (toolName: string) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onError?: (message: string) => void;
}
```

Add this constant immediately after `AssistantHandle`:

```ts
const BRIEF_RESPONSE_INSTRUCTIONS =
  "Responde en español de Ecuador con una o dos frases cortas. Prioriza solo lo más urgente o cercano. No enumeres todos los incidentes: el mapa y las tarjetas ya muestran el resto. No repitas información de respuestas anteriores.";
```

- [ ] **Step 2: Request processed microphone audio**

Replace:

```ts
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
mic.getTracks().forEach((track) => pc.addTrack(track, mic));
```

with:

```ts
const mic = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
const micTracks = mic.getAudioTracks();
micTracks.forEach((track) => pc.addTrack(track, mic));
```

- [ ] **Step 3: Centralize brief response creation**

Inside `startRealtimeSession`, replace the existing `sendUserText` function with these two functions:

```ts
function createBriefResponse() {
  responseActive = true;
  dc.send(
    JSON.stringify({
      type: "response.create",
      response: { instructions: BRIEF_RESPONSE_INSTRUCTIONS },
    }),
  );
}

function sendUserText(text: string) {
  dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    }),
  );
  createBriefResponse();
}
```

- [ ] **Step 4: Keep VAD boundaries but disable automatic responses**

At the beginning of `dc.onopen`, before the location context item, send:

```ts
dc.send(
  JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            create_response: false,
            interrupt_response: false,
          },
        },
      },
    },
  }),
);
```

Keep the current location context message and `flushPendingText()` after this update.

- [ ] **Step 5: Add speech and response lifecycle handling**

Inside `dc.onmessage`, immediately after JSON parsing and before transcript handling, use this complete lifecycle block:

```ts
if (msg.type === "input_audio_buffer.speech_started") {
  callbacks.onUserSpeechStarted?.();
  return;
}
if (msg.type === "input_audio_buffer.speech_stopped") {
  if (!responseActive && toolCallsInFlight === 0) createBriefResponse();
  return;
}
if (msg.type === "response.created") {
  responseActive = true;
  micTracks.forEach((track) => {
    track.enabled = false;
  });
  callbacks.onStatus?.("speaking");
  return;
}
if (
  msg.type === "response.done" ||
  msg.type === "response.cancelled" ||
  msg.type === "response.failed"
) {
  responseActive = false;
  micTracks.forEach((track) => {
    if (track.readyState === "live") track.enabled = true;
  });
  callbacks.onStatus?.("listening");
  flushPendingText();
  return;
}
if (msg.type === "error") {
  responseActive = false;
  micTracks.forEach((track) => {
    if (track.readyState === "live") track.enabled = true;
  });
  callbacks.onStatus?.("listening");
  callbacks.onError?.(msg.error?.message ?? "error de la sesión de voz");
  flushPendingText();
  return;
}
```

- [ ] **Step 6: Use the same brief response after tool output**

In the function-call handler, keep the current `decorateAgentToolResult` and callback flow. After sending the `function_call_output`, replace the raw `response.create` send and adjacent manual `responseActive = true` assignment with:

```ts
toolCallsInFlight -= 1;
createBriefResponse();
```

The resulting order must be: execute/decorate tool, call `onToolResult`, append `function_call_output`, decrement `toolCallsInFlight`, then call `createBriefResponse()`.

- [ ] **Step 7: Validate the transport**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0; `MediaTrackConstraints`, the partial `session.update`, and the new callback/status values typecheck.

- [ ] **Step 8: Commit only the transport file**

```powershell
git add frontend/lib/realtime-agent.ts
git commit -m "fix(assistant): prevent voice feedback and constrain replies"
```

---

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

### Task 5: Mobile voice verification and final quality review

**Files:**
- Review only: all frontend files changed in Tasks 1-4 plus the existing assistant cards they integrate.
- Modify only when fixing a verified CRITICAL or HIGH finding under `frontend/**`.

**Interfaces:**
- Consumes: the complete Cerca interaction.
- Produces: evidence that the acoustic loop, verbosity, map rendering, history disclosure, and resource cleanup work together.

- [ ] **Step 1: Run the production app on a phone-accessible origin**

Run from `frontend/` using the project's existing environment:

```powershell
npm run dev -- --hostname 0.0.0.0
```

Open `/assistant` on the Android device used for the reported screenshots and sign in.

- [ ] **Step 2: Verify the nearby-results exchange**

Say: `Hola Cerca, dime si hay algún incidente cerca de mí.`

Expected:

- One friendly nearby-tool chip appears.
- One compact map appears with the user's marker and incident pins.
- At most three incident rows appear below it.
- Cerca speaks and displays no more than one or two short sentences.
- No exact latitude/longitude is spoken or shown as copy.

- [ ] **Step 3: Verify acoustic isolation and history**

Let the answer play through the phone speaker without speaking over it.

Expected: no phrase from Cerca appears as a user bubble, no second tool call fires, and no unsolicited answer begins.

Then ask: `¿Cuál es el más relevante?`

Expected: the original exchange moves under `Ver conversación anterior`, the new exchange remains expanded, and expanding/collapsing history never hides the latest exchange.

- [ ] **Step 4: Verify cleanup and error recovery**

End the conversation.

Expected: the Android microphone indicator releases and the UI returns to `DESCONECTADO`. Restart, deny a fresh permission request if available, and confirm the existing Spanish retry state remains usable.

- [ ] **Step 5: Fan out the mandated final review**

Dispatch two parallel reviewers over the changed frontend diff:

- `ecc:react-reviewer`: hooks, state/ref races, list keys, lifecycle cleanup, accessibility, rendering behavior.
- `ecc:typescript-reviewer`: union types, callback contracts, event parsing, narrowing, module/barrel exports.

Fix every CRITICAL or HIGH finding without editing outside `frontend/**`.

- [ ] **Step 6: Re-run authoritative validation after review fixes**

Run from `frontend/`:

```powershell
npx tsc --noEmit
npx next build
```

Expected: both commands exit 0 after the final fix set.

- [ ] **Step 7: Commit review fixes only when needed**

```powershell
git add frontend
git commit -m "fix(assistant): address final voice UI review"
```

Before running `git add frontend`, inspect `git status --short` and use explicit file paths instead if unrelated frontend changes are present.

---

## Completion report

Report:

- Compact map: implemented and fed only from `get_nearby_incidents` tool results.
- Response control: client-owned brief responses with mic gating and processed microphone constraints.
- Conversation history: latest exchange expanded; previous exchanges behind `Ver conversación anterior`.
- Existing rich cards/tool labels/envelopes: preserved.
- Barrel exports wired: list the new lib/component symbols.
- Review: CRITICAL/HIGH React and TypeScript findings fixed, or state that none were found.
- Final `npx tsc --noEmit`: exact exit result.
- Final `npx next build`: exact exit result.
- Manual Android validation: exact steps completed and any environment limitation.
