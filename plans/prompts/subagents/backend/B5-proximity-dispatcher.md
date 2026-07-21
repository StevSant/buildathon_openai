# Sub-agent — B5: Proximity dispatcher & WhatsApp/SOS

Dispatch as the `prompt` of a `general-purpose` Agent AFTER B1 is frozen (parallel with B2/B3/B4).

---

```
You are implementing ONE plan for the Pulso PWA backend. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§4 proximity-dispatcher: trigger-driven on insert + manual SOS
                              { type: 'sos', location: { lat, lng } } → { dispatched: number })
- plans/backend/B5-proximity-dispatcher.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- backend/supabase/functions/proximity-dispatcher/**   (except _shared/**)
- backend/adapters/messaging/**   (hermes-whatsapp-gateway.ts — one symbol per file)
- backend/core/use-cases/dispatch-proximity-alerts.ts   (if the plan adjusts the use-case)

DO NOT:
- edit any file outside the list above
- edit barrels adapters/index.ts, adapters/messaging/index.ts, core/use-cases/index.ts —
  if you need a new export, REPORT it instead
- edit backend/core/domain/** type unions (FROZEN — e.g. alert-recipient.ts already exists;
  reuse it, don't redefine it) or backend/core/ports/** — REPORT any needed change
- edit backend/supabase/functions/_shared/** — REPORT any needed change
- edit migrations (frozen after B1). The incident-insert trigger belongs to B1's migrations; if a
  webhook/trigger wiring is missing, REPORT it to the orchestrator (do NOT touch migration files).
- edit frontend/**

CONVENTIONS:
- Uses get_alert_matches (from B1) to find recipients within their alert radius/severity.
- No hardcoded gateway/keys/thresholds — HERMES_API_URL, HERMES_API_KEY, HERMES_WHATSAPP_FROM,
  MAX_RADIUS_METERS via getEnv() / secrets (CONTRACT §6). Error envelope `{ error }`.
- SOS path derives the user from the JWT; the trigger path is server-invoked. WhatsApp copy in Spanish.
- Code + comments in English. One symbol per file. No automated tests (ADR-015).

VERIFY: `npm run typecheck` — no errors. If Deno available,
`deno check backend/supabase/functions/proximity-dispatcher/index.ts`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any barrel/port export, domain-type need, migration/trigger wiring, or _shared change the
   orchestrator must handle — name it; do NOT edit those yourself.
3. Any deviation from CONTRACT §4 (should be none) — explain.
4. The verify command you ran and its result.
```
