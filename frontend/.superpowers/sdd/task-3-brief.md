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

