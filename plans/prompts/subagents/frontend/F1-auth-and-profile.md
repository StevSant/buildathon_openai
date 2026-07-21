# Sub-agent — F1: Auth & Profile

Dispatch as the `prompt` of a `general-purpose` Agent from the frontend orchestrator.

---

```
You are implementing ONE plan for the Pulso PWA. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md              (frozen seam: §3.1 auth, §4 verify-identity — match exactly)
- plans/frontend/F1-auth-and-profile.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- frontend/app/auth/page.tsx
- frontend/components/AuthForm.tsx
- frontend/app/(app)/profile/page.tsx

DO NOT:
- edit any file outside the list above
- edit shared/frozen files: frontend/app/layout.tsx, frontend/app/(app)/layout.tsx,
  frontend/components/TabBar.tsx, frontend/lib/supabase.ts, or the barrels
  frontend/lib/index.ts + frontend/components/index.ts
- import runtime code from backend/** — import TYPES ONLY from @pulso/core (`import type`)

CONVENTIONS:
- UI copy in Spanish (Ecuador); code + comments in English.
- No hardcoded URLs/keys — read NEXT_PUBLIC_* via the existing config/env helper (CONTRACT §6).
- Sign-up = email + password + cédula → call the `verify-identity` function; show the verified badge.
- No automated tests (ADR-015) — verify with `cd frontend && npx tsc --noEmit`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any NEW barrel export needed (component/lib) — name it; DO NOT edit the barrel yourself.
3. Any deviation from CONTRACT.md (should be none) — explain.
4. The command you ran (`npx tsc --noEmit`) and its result.
```
