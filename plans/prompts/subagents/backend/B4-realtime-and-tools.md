# Sub-agent — B4: Realtime session & agent tools

Dispatch as the `prompt` of a `general-purpose` Agent AFTER B1 is frozen (parallel with B2/B3/B5).
Note: shares the `adapters/ai/` FOLDER with B3 but NO file — safe to run concurrently.

---

```
You are implementing ONE plan for the Pulso PWA backend. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§4 create-realtime-session + agent-tools, §5 tool contracts — CRITICAL; §3.2 RPC shapes)
- plans/backend/B4-realtime-and-tools.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- backend/supabase/functions/create-realtime-session/index.ts
- backend/supabase/functions/create-realtime-session/tools.ts
- backend/supabase/functions/agent-tools/index.ts
- backend/adapters/ai/openai-realtime-session-factory.ts
- backend/adapters/ai/realtime-persona.ts

DO NOT:
- edit any file outside the list above (esp. NOT openai-vision-analyzer.ts or fake-analyzer.ts — those are B3's)
- edit barrels adapters/index.ts, adapters/ai/index.ts, core/use-cases/index.ts, or core/ports/domain —
  if you need a new export, REPORT it instead
- edit backend/supabase/functions/_shared/** — REPORT any needed change
- edit migrations (frozen after B1) or frontend/**
- rename/re-key the tools — they MUST match CONTRACT §5 byte-for-byte (F4 mirrors them):
  get_nearby_incidents, get_incident_details({ incident_id }), confirm_incident({ incident_id, kind }).
  agent-tools reads the injected { lat, lng } (NOT user_lat/user_long).

CONVENTIONS:
- create-realtime-session returns { clientSecret, expiresAt, model, voice } (§4); mint is ephemeral,
  the real OPENAI_API_KEY never reaches the browser. No hardcoded model/voice/keys —
  OPENAI_API_KEY, OPENAI_REALTIME_MODEL, OPENAI_REALTIME_VOICE, OPENAI_BASE_URL via getEnv() (§6).
- agent-tools derives user from JWT, validates args, uses a user-scoped client, error envelope `{ error }`.
- Persona instructions in Spanish (client sends only a validated personaId, never a raw prompt).
- Code + comments in English. One symbol per file. No automated tests (ADR-015).

VERIFY: `npm run typecheck` — no errors. If Deno available, deno check both function index.ts files.
Optionally mint a session + call agent-tools per the plan's Task 5.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any barrel/port export or _shared change the orchestrator must wire — name it; do NOT edit it yourself.
3. Any deviation from CONTRACT §4/§5 (should be none) — explain.
4. The verify command you ran and its result.
```
