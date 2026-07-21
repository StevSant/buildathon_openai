# Sub-agent — F6: Safety, WhatsApp & SOS

Dispatch as the `prompt` of a `general-purpose` Agent from the frontend orchestrator.

---

```
You are implementing ONE plan for the Pulso PWA. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§3.3 safety config tables, §4 proximity-dispatcher SOS — match exactly)
- plans/frontend/F6-safety-whatsapp-sos.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- frontend/app/(app)/profile/security/page.tsx   ("Seguridad y WhatsApp" screen)
- frontend/components/EmergencyContactsForm.tsx
- frontend/components/AlertRulesForm.tsx
- frontend/components/SosButton.tsx

DO NOT:
- edit any file outside the list above
- edit frontend/app/(app)/profile/page.tsx — that is F1's file (you only own the security/ subroute)
- edit shared/frozen files: app/layout.tsx, app/(app)/layout.tsx, components/TabBar.tsx,
  lib/supabase.ts, or the barrels lib/index.ts + components/index.ts
- import runtime code from backend/** — import TYPES ONLY from @pulso/core (`import type`)

CONVENTIONS:
- UI copy in Spanish (Ecuador); code + comments in English.
- Owner-only CRUD on `whatsapp_config`, `emergency_contacts`, `alert_rules` (RLS-guarded; client
  writes only its own rows). SOS button POSTs proximity-dispatcher `{ type: 'sos', location: { lat, lng } }`.
- No hardcoded thresholds/urls — env only (CONTRACT §6).
- No automated tests (ADR-015) — verify with `cd frontend && npx tsc --noEmit`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any NEW barrel export needed — name it; DO NOT edit the barrel yourself.
3. Any deviation from CONTRACT.md (should be none) — explain.
4. The command you ran (`npx tsc --noEmit`) and its result.
```
