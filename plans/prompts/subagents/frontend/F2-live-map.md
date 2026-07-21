# Sub-agent — F2: Live Map

Dispatch as the `prompt` of a `general-purpose` Agent from the frontend orchestrator.

---

```
You are implementing ONE plan for the Pulso PWA. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§2 types, §3.2 RPCs, §3.4 Realtime — match the snake_case DTOs + lng/lat)
- plans/frontend/F2-live-map.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- frontend/app/(app)/page.tsx            (the Mapa home screen)
- frontend/components/IncidentMap.tsx
- frontend/components/IncidentDetailSheet.tsx
- frontend/lib/incidents.ts              (thin client: get_nearby_incidents, get_incident_details, confirm_incident)

DO NOT:
- edit any file outside the list above
- edit shared/frozen files: app/layout.tsx, app/(app)/layout.tsx, components/TabBar.tsx,
  lib/supabase.ts, or the barrels lib/index.ts + components/index.ts
- import runtime code from backend/** — import TYPES ONLY from @pulso/core (`import type`)
- own the notifications Realtime channel — the map has its OWN channel/subscription (CONTRACT §3.4)

CONVENTIONS:
- UI copy in Spanish (Ecuador); code + comments in English.
- No hardcoded coords/zoom/radius/style — use NEXT_PUBLIC_MAP_STYLE_URL, NEXT_PUBLIC_DEFAULT_LAT/LNG/
  ZOOM, NEXT_PUBLIC_DEFAULT_RADIUS_METERS (CONTRACT §6). Coordinates are lng/lat.
- Markers by category + severity; detail sheet supports confirm/dispute via `kind`.
- No automated tests (ADR-015) — verify with `cd frontend && npx tsc --noEmit`.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any NEW barrel export needed — name it; DO NOT edit the barrel yourself.
3. Any deviation from CONTRACT.md (should be none) — explain.
4. The command you ran (`npx tsc --noEmit`) and its result.
```
