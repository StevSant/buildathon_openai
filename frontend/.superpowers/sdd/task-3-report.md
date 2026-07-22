# Task 3 report: Controlled Realtime responses and acoustic isolation

## Changes

- Extended AssistantStatus with speaking and added onUserSpeechStarted.
- Requested microphone audio with echo cancellation, noise suppression, and automatic gain control.
- Centralized response.create with a short Spanish-Ecuador response instruction and synchronously locked the microphone and UI before the server acknowledgement.
- Kept server VAD boundaries while disabling automatic response creation and interruption.
- Tracked generation and output playback separately, holding tool and typed continuations until buffered audio stops.
- Prevented newer tool, typed, or VAD responses from starting during active playback, eliminating stale output-buffer stop races without relying on response identifiers.
- Batched concurrent tool calls behind one pending continuation, keeping the UI out of listening state and producing exactly one follow-up response after all tool outputs and response completion.
- Guarded tool argument parsing, returned malformed-argument errors through function_call_output, and always released the in-flight counter in finally.
- Reused the controlled brief response path after raw tool results while preserving the typed-text queue, location context, tool bridge, and existing contracts.

## Validation

- npx tsc --noEmit from frontend/: passed (exit code 0).
- git diff --check -- frontend/lib/realtime-agent.ts: passed.
- No automated tests were added, per ADR-015 and the repository instructions.

## Concerns

- Browser/WebRTC runtime behavior still needs mobile-device validation with a real Realtime session, especially the output_audio_buffer event order and microphone restoration.
- The UI consumer must handle the new speaking status and onUserSpeechStarted callback in the following integration task.
- No commit was created, as requested.
