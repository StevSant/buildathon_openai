# Assistant Hold-to-Talk Design

## Goal

Prevent ambient conversations and external sounds from creating unintended Realtime turns while keeping the existing Cerca session, transcript, tool bridge, and rich incident results intact.

## Root cause

The current WebRTC client enables `server_vad` and leaves the microphone track enabled whenever the assistant is idle. After every response it enables the microphone again. Server VAD therefore treats sufficiently speech-like external audio as a new user turn; browser noise suppression cannot reliably distinguish the user's voice from nearby speech.

## Interaction design

- The main **Hablar con Cerca** action establishes the Realtime session but does not begin recording.
- Once connected, the orb becomes a hold-to-talk control.
- Its resting copy is **Mantén presionado el orbe para hablar**.
- While held, the microphone is enabled and the UI reads **Te escucho…**.
- Releasing or canceling the pointer immediately disables the microphone, commits only that captured buffer, and requests a response.
- The existing **Finalizar conversación** action closes the microphone, data channel, and peer connection.
- Suggested text questions continue to work without opening the microphone.

## Realtime architecture

`frontend/lib/realtime-agent.ts` remains the sole owner of WebRTC and Realtime control events. It will expose `startVoiceTurn()` and `finishVoiceTurn()` on `AssistantHandle` in addition to the existing `sendText()` and `stop()` methods.

When the data channel opens, the client sends `session.update` with `audio.input.turn_detection: null` and keeps every microphone track disabled. Starting a voice turn sends `input_audio_buffer.clear`, cancels an active response if necessary, clears unplayed output audio when necessary, then enables the microphone. Finishing the turn disables the microphone before sending `input_audio_buffer.commit` followed by the existing brief `response.create` flow.

The component owns pointer interaction only. `frontend/components/RealtimeAssistant.tsx` calls the new handle methods from pointer-down and pointer-up/cancel handlers, tracks whether a hold is active for copy and styling, and never directly manipulates media tracks or data-channel events.

## State and concurrency

- A voice turn can start only when the data channel is open and no other voice turn is active.
- Releasing without an active voice turn is a no-op.
- Starting a voice turn while the model is responding interrupts that response before recording.
- Text questions remain serialized through the existing response/tool-call queue.
- Stopping or losing the session clears the local hold state and stops every microphone track.
- Pointer capture keeps release/cancel handling reliable if the finger moves outside the orb.

## Error handling

If the session cannot connect or microphone permission is denied, the existing retry state remains. A commit or control-event failure reported by Realtime uses the existing user-facing assistant error message. No coordinates, secrets, thresholds, or API URLs are added or hardcoded.

## Verification

ADR-015 prohibits adding automated tests. Verification will use:

1. `npx tsc --noEmit` from `frontend/`.
2. `npx next build` from `frontend/`.
3. Manual browser checks: connected-and-idle ambient speech creates no turn; holding the orb records; releasing creates exactly one turn; suggested questions work with the mic closed; stopping releases the microphone indicator.

## Scope

Only `frontend/lib/realtime-agent.ts` and `frontend/components/RealtimeAssistant.tsx` require production changes. Existing uncommitted conversation, map, transcript, and response-serialization work in those files must be preserved. No backend, contract, barrel, root configuration, or F7 files will be changed.
