# Sub-agent — B2: Identity verification

Dispatch as the `prompt` of a `general-purpose` Agent AFTER B1 is frozen (parallel with B3/B4/B5).

---

```
You are implementing ONE plan for the Pulso PWA backend. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§4 verify-identity: request { cedula } → { verified, method, reason? })
- plans/backend/B2-identity.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- backend/supabase/functions/verify-identity/**   (except _shared/** — see below)
- backend/adapters/identity/**   (registry-api-verifier.ts, algorithmic-verifier.ts,
                                  composite-verifier.ts — one symbol per file)
- backend/adapters/persistence/hash-cedula.ts     (cédula HMAC hashing — store only cedula_hash)
- backend/core/use-cases/verify-identity.ts       (if the plan defines/adjusts the use-case)

DO NOT:
- edit any file outside the list above
- edit top-level barrels adapters/index.ts, adapters/identity/index.ts, core/use-cases/index.ts,
  or backend/core/ports / backend/core/domain — if you need a new export, REPORT it instead
- edit backend/supabase/functions/_shared/** (shared by all functions) — REPORT any needed change
- edit migrations (frozen after B1) or frontend/**

CONVENTIONS:
- Derive user_id from the JWT (`userFromJwt`); NEVER trust a user_id in the body.
- No hardcoded keys/urls — CEDULA_HASH_PEPPER, IDENTITY_VERIFY_API_URL, IDENTITY_VERIFY_API_KEY via
  getEnv() / Supabase secrets (CONTRACT §6). Store only the HMAC `cedula_hash`, never the raw cédula.
- Error envelope `{ error: string }` on non-2xx (CONTRACT §4). Registry method → 'registry',
  module-10 fallback → 'algorithmic'.
- One class/function per file. Code + comments in English. No automated tests (ADR-015).

VERIFY: `npm run typecheck` (from repo root) — no errors. If Deno is available,
`deno check backend/supabase/functions/verify-identity/index.ts`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any barrel/port export or _shared change the orchestrator must wire — name it; do NOT edit it yourself.
3. Any deviation from CONTRACT §4 (should be none) — explain.
4. The verify command you ran and its result.
```
