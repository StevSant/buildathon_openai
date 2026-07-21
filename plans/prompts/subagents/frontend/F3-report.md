# Sub-agent — F3: Report flow

Dispatch as the `prompt` of a `general-purpose` Agent from the frontend orchestrator.

---

```
You are implementing ONE plan for the Pulso PWA. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§3.3 incident insert, §3.5 Storage, §4 analyze-report — match exactly)
- plans/frontend/F3-report.md    (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- frontend/app/(app)/report/page.tsx
- frontend/components/ReportForm.tsx

DO NOT:
- edit any file outside the list above
- edit shared/frozen files: app/layout.tsx, app/(app)/layout.tsx, components/TabBar.tsx,
  lib/supabase.ts, lib/incidents.ts (F2 owns it), or the barrels lib/index.ts + components/index.ts
- import runtime code from backend/** — import TYPES ONLY from @pulso/core (`import type`)

CONVENTIONS:
- UI copy in Spanish (Ecuador); code + comments in English.
- Flow: camera/upload → Storage bucket `report-photos` at `<auth.uid()>/<uuid>.jpg` → send the
  returned `photo_path` to `analyze-report` → editable review (category/severity/title/description) →
  publish via `insert into incidents` with location = st_point(lng,lat). Fields stay user-editable.
- Read the analyze-report error envelope as `data.error` (CONTRACT §4).
- No hardcoded keys/urls — env only (CONTRACT §6).
- No automated tests (ADR-015) — verify with `cd frontend && npx tsc --noEmit`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any NEW barrel export needed — name it; DO NOT edit the barrel yourself.
3. Any deviation from CONTRACT.md (should be none) — explain.
4. The command you ran (`npx tsc --noEmit`) and its result.
```
