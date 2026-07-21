# Sub-agent — F4: Voice assistant ("Cerca")

Dispatch as the `prompt` of a `general-purpose` Agent from the frontend orchestrator.

---

```
You are implementing ONE plan for the Pulso PWA. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§4 create-realtime-session + agent-tools, §5 tool contracts — CRITICAL)
- plans/frontend/F4-voice-assistant.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- frontend/app/(app)/assistant/page.tsx
- frontend/components/RealtimeAssistant.tsx
- frontend/lib/realtime-agent.ts        (WebRTC session lifecycle against create-realtime-session)
- frontend/lib/realtime-tools.ts        (tool JSON-schemas + the agent-tools bridge)

DO NOT:
- edit any file outside the list above
- edit shared/frozen files: app/layout.tsx, app/(app)/layout.tsx, components/TabBar.tsx,
  lib/supabase.ts, or the barrels lib/index.ts + components/index.ts
- import runtime code from backend/** — import TYPES ONLY from @pulso/core (`import type`)
- rename or re-key the tools — they MUST stay byte-for-byte aligned with CONTRACT §5:
  get_nearby_incidents({ radius_meters?, filter_category? }), get_incident_details({ incident_id }),
  confirm_incident({ incident_id, kind }). The frontend injects the user's { lat, lng } from
  navigator.geolocation into get_nearby_incidents args before POSTing agent-tools (model never
  invents coordinates). Bridge flow: response.function_call_arguments.done → POST agent-tools →
  conversation.item.create { function_call_output } → response.create.

CONVENTIONS:
- UI copy in Spanish (Ecuador); code + comments in English.
- No hardcoded model/voice/url — the session response carries { clientSecret, expiresAt, model, voice };
  use those. Env only for anything else (CONTRACT §6).
- No automated tests (ADR-015) — verify with `cd frontend && npx tsc --noEmit`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any NEW barrel export needed — name it; DO NOT edit the barrel yourself.
3. Any deviation from CONTRACT §5 tool names/keys (should be none) — explain.
4. The command you ran (`npx tsc --noEmit`) and its result.
```
