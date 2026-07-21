# Anonymous Reporting with Verified Identity Gate — Design

**Date:** 2026-07-21
**Status:** Approved (brainstorming session with Bryan)
**Relates to:** ADR-020 (to be written), migrations 0001/0002, CONTRACT.md §2

## Problem

Users may not report incidents for fear of retaliation: `get_incident_details`
returns `reporter_name` and the incident sheet renders "Reportado por {name}",
so anyone browsing the map sees who reported. Meanwhile the deterrent side is
incomplete: `trust_score` exists but nothing disables an abusive account.

Cédula handling is already safe — `hash-cedula.ts` stores only
HMAC-SHA256(pepper, cédula); the raw cédula never persists — and signup already
shows a hashing disclaimer. This design closes the remaining gaps.

## Decisions (locked)

1. **Anonymity model: anonymous to users, linked internally.** No reporter
   identity is shown anywhere in the UI. The DB keeps `incidents.reporter_id`
   so moderation and account-disable work.
2. **Abuse enforcement: manual disable + RLS block.** `profiles.disabled_at`
   set by hand (Supabase dashboard) for the hackathon; RLS rejects writes from
   disabled profiles. `cedula_hash unique` blocks re-registration — profiles
   are disabled, never deleted (hash tombstone).
3. **Disclaimers: at report time + signup.** Honest wording — anonymous to
   other users, identity used internally to prevent abuse. No promise of
   absolute anonymity.

## Changes

### Data layer (edit migrations in place — DB never deployed)

- `get_incident_details`: drop `reporter_name` from RETURNS and SELECT.
  Keep `reporter_verified`.
- `profiles`: add `disabled_at timestamptz` (null = active).
- New helper `public.is_active_profile()` — true when `auth.uid()`'s profile
  has `disabled_at is null`. Applied to:
  - `incidents - insert own` policy (`and public.is_active_profile()`)
  - `confirmations - insert own` policy (same — disabled users cannot
    dispute-bomb either)

### Contract & DTOs (one seam, three mirrors)

- `plans/CONTRACT.md` §2: remove `reporter_name` from `IncidentDetails`
  (explicit amendment of the frozen contract; update plans F2/B1 to match).
- `backend/core/domain/incident-details.ts`: drop `reporter_name`.
- `backend/adapters/persistence/supabase-incident-repository.ts`: drop mapping.
- `frontend/lib/incidents.ts`: drop mapping.
- The voice agent "Cerca" (`agent-tools`) inherits the fix automatically — it
  goes through the same use-case/RPC.

### Frontend UX + copy (Spanish — product locale)

- **IncidentDetailSheet**: replace "Reportado por {name}" with a chip:
  `Reporte verificado ✓` (teal) when `reporter_verified`, else
  `Reporte ciudadano`.
- **ReportForm** — reassurance line near submit:
  > 🔒 Tu reporte es anónimo: otros usuarios nunca ven tu nombre ni tus datos.
  > Tu identidad verificada solo se usa para evitar reportes falsos.
- **AuthForm (signup)** — extend existing disclaimer:
  > Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a
  > nadie. Tus reportes son anónimos para otros usuarios; si una cuenta
  > publica reportes falsos, se deshabilita y esa cédula no puede volver a
  > registrarse.

### Error handling

Disabled user's insert fails RLS → PostgREST error. `ReportForm` catches it
and shows a friendly Spanish message ("Tu cuenta está deshabilitada por
reportes falsos…") instead of a raw error. Reads (map) keep working for
disabled users.

### Documentation

- New **ADR-020** in `docs/DECISIONS.md`: anonymity model, manual disable,
  residual risk.

## Residual risk (accepted for hackathon)

The `incidents - read active` RLS policy lets an authenticated user read
`reporter_id` (bare uuid) via direct PostgREST or in Realtime payloads.
Profiles RLS blocks mapping uuid→name, so exposure is limited to cross-report
correlation by uuid. Column-level `REVOKE` would break Supabase Realtime
(`postgres_changes` does not support column-level security), so this is
accepted and documented in ADR-020. P1 hardening path:
broadcast-from-database. The fear-vector that matters — the name on screen —
is fully closed.

## Verification (per ADR-015: no tests)

- Backend `npm run typecheck` + frontend `npx tsc --noEmit` + `next build`
  stay green.
- Manual demo flow: report → map → detail shows no name → set `disabled_at`
  in dashboard → new report blocked with friendly message.

## Out of scope (YAGNI)

Pseudonyms/reputation, dispute-driven auto-disable, cryptographic blind
tokens, moderation UI, web push.
