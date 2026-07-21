# Sub-agent — F5: Notifications (3-tier)

Dispatch as the `prompt` of a `general-purpose` Agent from the frontend orchestrator.

---

```
You are implementing ONE plan for the Pulso PWA. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§2 types, §3.4 Realtime — the notifications channel is SEPARATE from the map's)
- plans/frontend/F5-notifications.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- frontend/app/(app)/notifications/page.tsx     (notification center)
- frontend/components/NotificationBell.tsx
- frontend/components/NotificationToast.tsx
- frontend/components/NotificationBottomSheet.tsx
- frontend/lib/notifications.ts                 (its OWN Realtime channel/subscription)

DO NOT:
- edit any file outside the list above
- edit shared/frozen files: app/layout.tsx, app/(app)/layout.tsx, components/TabBar.tsx,
  lib/supabase.ts, lib/incidents.ts (F2 owns the map channel), or the barrels lib/index.ts +
  components/index.ts
- import runtime code from backend/** — import TYPES ONLY from @pulso/core (`import type`)

CONVENTIONS:
- UI copy in Spanish (Ecuador); code + comments in English.
- 3 tiers (ADR-016, in-app only, no web push): bottom sheet (high) / toast (medium) / center + bell.
- Own a dedicated `supabase.channel('...')` subscription — do NOT reuse the map's channel (CONTRACT §3.4).
- Severity/radius thresholds via NEXT_PUBLIC_ALERT_SEVERITY_MIN / NEXT_PUBLIC_ALERT_RADIUS_METERS
  — no hardcoded numbers (CONTRACT §6).
- No automated tests (ADR-015) — verify with `cd frontend && npx tsc --noEmit`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any NEW barrel export needed — name it; DO NOT edit the barrel yourself.
3. Any deviation from CONTRACT.md (should be none) — explain.
4. The command you ran (`npx tsc --noEmit`) and its result.
```
