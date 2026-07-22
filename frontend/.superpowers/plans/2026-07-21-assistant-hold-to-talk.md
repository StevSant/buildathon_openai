# Assistant Hold-to-Talk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop ambient audio from triggering Cerca by replacing continuous server VAD with an explicit WebRTC hold-to-talk gate.

**Architecture:** `realtime-agent.ts` owns microphone tracks and Realtime control events; its handle gains voice-turn methods. `RealtimeAssistant.tsx` owns pointer interaction and UI copy only. Existing transcript, tool bridge, rich result cards, and text-question queue remain unchanged.

**Tech Stack:** Next.js 14, React 18, TypeScript 5.6, browser WebRTC, OpenAI Realtime API.

## Global Constraints

- Modify only `frontend/**`.
- Preserve all existing uncommitted work in the target files.
- Do not add automated tests (ADR-015).
- User-facing copy is Spanish for Ecuador; code and comments are English.
- Do not hardcode URLs, secrets, thresholds, coordinates, or configuration.
- Do not commit overlapping user changes without explicit authorization.

---

### Task 1: Add a manual voice-turn gate to the Realtime bridge

**Files:**
- Modify: `frontend/lib/realtime-agent.ts`

**Interfaces:**
- Consumes: the existing WebRTC microphone stream and `oai-events` data channel.
- Produces: `AssistantHandle.startVoiceTurn(): boolean` and `AssistantHandle.finishVoiceTurn(): boolean`.

- [ ] **Step 1: Extend the handle contract**

Add two synchronous methods. Their boolean result tells the component whether a transition actually occurred:

```ts
export interface AssistantHandle {
  stop: () => void;
  sendText: (text: string) => void;
  startVoiceTurn: () => boolean;
  finishVoiceTurn: () => boolean;
}
```

- [ ] **Step 2: Disable continuous capture and VAD**

Immediately after collecting `micTracks`, disable every track before adding it to the peer connection. Replace the `server_vad` session configuration with:

```ts
audio: {
  input: {
    turn_detection: null,
  },
},
```

Remove speech-started/speech-stopped event handling and the callback that exists only for VAD-driven exchange creation.

- [ ] **Step 3: Implement explicit turn transitions**

Maintain `let voiceTurnActive = false`. Starting a turn must require an open channel, clear stale input, cancel an active response, clear active output audio, then enable the microphone:

```ts
function startVoiceTurn(): boolean {
  if (voiceTurnActive || dc.readyState !== "open") return false;
  dc.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  if (responseActive) {
    dc.send(JSON.stringify({ type: "response.cancel" }));
  }
  if (outputAudioActive) {
    dc.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
  }
  responseActive = false;
  outputAudioActive = false;
  voiceTurnActive = true;
  micTracks.forEach((track) => {
    if (track.readyState === "live") track.enabled = true;
  });
  callbacks.onStatus?.("listening");
  return true;
}
```

Finishing must mute first, then commit and create the existing brief response:

```ts
function finishVoiceTurn(): boolean {
  if (!voiceTurnActive || dc.readyState !== "open") return false;
  voiceTurnActive = false;
  disableMicrophone();
  dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  createBriefResponse();
  return true;
}
```

Return both functions on the handle. `stop()` must set `voiceTurnActive = false` before stopping tracks.

- [ ] **Step 4: Keep the microphone closed while idle**

Replace automatic microphone restoration with status restoration only:

```ts
function restoreReadyWhenIdle() {
  if (responseActive || outputAudioActive || voiceTurnActive) return;
  disableMicrophone();
  callbacks.onStatus?.("ready");
}
```

Add `"ready"` to `AssistantStatus`; use it when the data channel opens and after output/response completion. Reserve `"listening"` for an active held turn.

---

### Task 2: Make the orb a hold-to-talk control

**Files:**
- Modify: `frontend/components/RealtimeAssistant.tsx`

**Interfaces:**
- Consumes: `AssistantHandle.startVoiceTurn()` and `finishVoiceTurn()`.
- Produces: pointer-safe hold-to-talk UI and Spanish state copy.

- [ ] **Step 1: Track an active press**

Add `const [voiceTurnActive, setVoiceTurnActive] = useState(false);`. Clear it in `stop()` and when connection errors or closes.

- [ ] **Step 2: Add pointer handlers**

On pointer down, ensure the session is connected, capture the pointer, begin a new exchange, and call `startVoiceTurn()`. On pointer up/cancel/lost capture, call `finishVoiceTurn()` once and clear local state. Prevent the orb click from toggling or closing the session.

```ts
async function startVoiceTurn(event: React.PointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  const session = handle.current ?? (await start());
  if (!session?.startVoiceTurn()) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  beginExchange();
  setVoiceTurnActive(true);
}

function finishVoiceTurn() {
  if (!voiceTurnActive) return;
  handle.current?.finishVoiceTurn();
  setVoiceTurnActive(false);
}
```

- [ ] **Step 3: Update state-derived UI**

Treat `ready`, `listening`, `speaking`, and `connecting` as a live session. The orb uses the pointer handlers and is disabled only while connecting. Display:

- `Mantén presionado el orbe para hablar` when ready.
- `Te escucho…` while held/listening.
- `Cerca está respondiendo…` while speaking.
- `Conectando…` while connecting.

The bottom action starts a disconnected session or ends a connected session; text suggestion chips remain disabled while connecting or speaking and continue to use `sendText()` without opening the mic.

- [ ] **Step 4: Verify static behavior**

Run from `frontend/`:

```powershell
npx tsc --noEmit
npx next build
```

Expected: both commands exit 0 with no TypeScript or production-build errors.

---

### Task 3: Manual browser verification

**Files:** none.

- [ ] **Step 1: Start the app and connect Cerca**

Run `npm run dev`, open `/assistant`, and tap **Hablar con Cerca**. Expected: the session reaches the ready state while the browser microphone indicator is not actively capturing audio packets.

- [ ] **Step 2: Verify ambient isolation**

Leave the session connected without touching the orb while nearby speech or media plays. Expected: no user transcript, response, or tool call is created.

- [ ] **Step 3: Verify one intentional voice turn**

Hold the orb, ask “¿Qué pasa cerca de mí?”, then release. Expected: **Te escucho…** only while held, one user transcript after release, one tool call/response, then the mic returns to ready and closed.

- [ ] **Step 4: Verify non-voice paths and cleanup**

Tap a suggested question without holding the orb; it should respond with the mic closed. Tap **Finalizar conversación**; the peer connection closes and the browser microphone indicator disappears.
