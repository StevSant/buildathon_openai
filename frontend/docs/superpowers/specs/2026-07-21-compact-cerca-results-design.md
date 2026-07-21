# Compact Cerca Results and Stable Voice Turns

## Context

The Cerca screen currently accumulates every transcript fragment, tool call, and tool result in one expanded feed. A nearby-incidents answer can therefore occupy several phone screens even though the underlying tool result already contains structured coordinates, distance, status, and confirmation data.

The captured Android session also shows an acoustic feedback loop. Phrases from Cerca's own answer reappear as short user transcripts (for example, "Si necesitas"), which causes voice activity detection to create another response. The resulting turns repeat and expand the same incident list.

Existing uncommitted work already adds rich incident summary and detail cards. This design preserves and integrates that work. All implementation changes remain under `frontend/**`; existing backend changes are not modified.

## Goals

- Show where nearby incidents are located with a compact map rather than explaining every location in prose.
- Keep only the latest exchange expanded and place older exchanges behind a Spanish disclosure control.
- Make Cerca answer in one or two short sentences while structured UI carries the detail.
- Prevent Cerca's output audio from returning through the microphone as a new user turn.
- Preserve the frozen tool contracts and use only incident data returned by `agent-tools`.
- Keep the hands-free interaction after the user starts a session.

## Non-goals

- No backend, migration, contract, root configuration, or root package changes.
- No new API endpoint or tool schema.
- No route-planning, map navigation, clustering, or full incident-detail sheet inside the compact map.
- No new environment variable or hardcoded location, radius, API URL, or application threshold.
- No automated test suite; ADR-015 requires TypeScript, production-build, and manual validation.

## Considered approaches

### 1. Presentation-only cleanup

Add a compact map and collapse history without changing Realtime turn handling.

This is low risk but does not stop long spoken responses or the acoustic feedback loop. The screen would be shorter while the voice experience could continue repeating itself.

### 2. Compact results plus controlled Realtime turns (selected)

Render structured results visually, manually trigger Realtime responses with a brief response instruction, enable browser audio processing, and pause the microphone track while the assistant is responding.

This addresses the visible symptom and both underlying causes while staying entirely in the frontend lane. The trade-off is that users cannot interrupt Cerca mid-answer; answers are deliberately short, so that loss is acceptable for the MVP.

### 3. Push-to-talk

Disable automatic turn detection and require a press-and-hold gesture for every user turn.

This gives the strongest acoustic isolation, but it makes follow-up questions less natural and changes the established product interaction more than necessary.

## UI design

### Latest exchange

The conversation area is divided into two sections:

- The latest exchange is always visible.
- When earlier content exists, a native disclosure labeled `Ver conversación anterior` contains all previous exchanges. Its summary includes the previous-turn count when available.

An exchange begins with a user text or completed voice transcript and includes the subsequent tool call, structured tool result, and final agent transcript. A typed suggestion is inserted immediately as the current user turn. A completed voice transcript starts the next exchange.

### Compact nearby map

A new `AssistantIncidentMap` component renders when `get_nearby_incidents` returns at least one row:

- It reuses MapLibre, the configured map style, the user's granted location, and the category pin colors already used by the main map.
- The map is a compact, non-interactive preview centered on the user's real location at the configured default zoom.
- It shows the user's position and all returned incident pins.
- It has a short accessible label and does not expose exact coordinates as text.

Below the preview, the existing `AssistantIncidentCards` renders at most three concise rows. The agent transcript should summarize only the most urgent or nearest result in one or two sentences; the map and cards carry the remaining evidence.

`get_incident_details` continues to render the existing `AssistantIncidentDetailCard`. Empty nearby results show a short Spanish empty-state sentence and no blank map.

## Realtime turn control

`realtime-agent.ts` keeps server VAD for speech boundaries but disables VAD's automatic response creation and automatic interruption through a partial `session.update`. The client then owns when a response begins:

1. `input_audio_buffer.speech_stopped` triggers a client `response.create`.
2. Typed suggestion questions use the same response helper.
3. After a function result is appended, the bridge uses the same response helper for the final answer.
4. Every client-created response includes an instruction to answer in Ecuadorian Spanish, use no more than one or two short sentences, prioritize the urgent/nearby result, and rely on the visual map/cards for the rest.

This preserves the server-set persona and tools because the client does not replace session instructions. It adds only per-response guidance.

The session requests microphone audio with browser `echoCancellation`, `noiseSuppression`, and `autoGainControl` constraints. On `response.created`, the local microphone track is disabled and the UI enters a speaking state. On `response.done`, `response.cancelled`, or a response error, the track is re-enabled and the UI returns to listening. Stopping the session always stops the track and closes the peer connection/data channel.

OpenAI documents that VAD normally creates responses automatically and that clients may keep VAD while disabling `create_response` and `interrupt_response` to control response generation. OpenAI also documents the `response.output_audio.done`/`response.done` lifecycle and provides an official Realtime example that mutes the microphone while the assistant speaks.

## Component and data changes

### `frontend/components/AssistantIncidentMap.tsx`

Owns the compact MapLibre preview. Inputs are `incidents: NearbyIncident[]` and `center: { lat: number; long: number }`. It performs no network access.

### `frontend/components/RealtimeAssistant.tsx`

Stores the granted user location for map rendering, groups the flat event stream into current and previous exchanges, renders the disclosure/history boundary, and recognizes the new `speaking` status. It preserves the existing rich-card turns and suggestion chips.

### `frontend/lib/realtime-agent.ts`

Owns controlled response creation, microphone audio constraints, microphone gating during assistant responses, and the new speaking status. Tool names, argument keys, location injection, and callback result shapes remain unchanged.

### Barrels and styles

`frontend/components/index.ts` exports the new map component. `frontend/app/globals.css` adds only the compact-map, history-disclosure, and speaking-state presentation required by the design.

## Error handling

- A location or microphone denial keeps the existing connection error/retry state.
- A tool failure remains a tool output error and does not render a map.
- Malformed or empty nearby results render no map/card and allow the concise agent error/empty response to remain visible.
- Realtime response cancellation/error always restores the microphone track to avoid leaving the session silently muted.
- A transient map-style failure does not remove the textual incident rows.

## Validation

Run from `frontend/`:

```powershell
npx tsc --noEmit
npx next build
```

Then manually validate on a mic-enabled Android browser:

1. Start Cerca and ask what is nearby.
2. Confirm one tool chip, one compact map, no more than three incident rows, and a one-to-two-sentence answer.
3. Let Cerca finish through the phone speaker and confirm its speech does not appear as a new user transcript or trigger another answer.
4. Ask a real follow-up and confirm the prior exchange moves under `Ver conversación anterior`.
5. Expand/collapse history and verify the latest exchange stays visible.
6. End the conversation and confirm the microphone indicator releases.

## Ownership and integration

The implementation will use branch `feat/frontend-lane` and edit only `frontend/**`. Existing uncommitted files, including the rich assistant cards, are treated as user work and preserved. No backend or frozen-contract file is staged or committed as part of this change.
