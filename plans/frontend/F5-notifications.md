# F5 — 3-Tier Notifications Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**` only).
**Goal:** When a new nearby incident arrives over Supabase Realtime, surface it in one of three
tiers — a **bottom sheet** when it is severe AND close, a **toast** otherwise, and always in the
**notification center** — per ADR-016.
**Depends on:** B1 (`get_nearby_incidents` returns `distance_meters` + coords); the CONTRACT stubs
let this run before backend is finished.
**Reads from CONTRACT:** §3.2 (`get_nearby_incidents`), §3.4 (Realtime channel).

## Global Constraints (apply to every task)
- Thresholds come from `config` (env: `NEXT_PUBLIC_ALERT_MIN_SEVERITY`,
  `NEXT_PUBLIC_ALERT_RADIUS_METERS`) via `decideAlertTier` — never hardcoded.
- One component per file; import from `@/components`, `@/lib`, type-only from `@pulso/core`.
- UI copy in Spanish. Comments/commits → English.

**Scaffold reality (verified):** most of this feature exists — `frontend/lib/notifications.ts`
(`decideAlertTier`), `frontend/components/NotificationToast.tsx`,
`NotificationBottomSheet.tsx`, `NotificationBell.tsx`, and the center screen
`frontend/app/(app)/notifications/page.tsx` (lists nearby incidents, tags each tier) are all
complete. The MISSING piece is the **live surfacer**: nothing subscribes to Realtime to actually
raise a sheet/toast when a new incident arrives. This plan adds a `NotificationHost` client
component and mounts it once in the `(app)` shell.

**FRs covered:** FR-17 (3-tier surfacing on Realtime INSERT), FR-18 (center lists recent nearby —
already done), FR-19 (thresholds from env, overridable — env part done here; per-user override is F6).

---

### Task 1: Create the `NotificationHost` live surfacer

**Files:**
- Create: `frontend/components/NotificationHost.tsx`
- Modify: `frontend/components/index.ts` (barrel export)

**Interfaces:**
- Consumes: `getNearbyIncidents`, `subscribeToIncidents`, `decideAlertTier`, `config` from `@/lib`;
  `NotificationToast`, `NotificationBottomSheet` from `./`.
- Produces: `export default function NotificationHost()` — renders the transient sheet/toast overlays.

- [ ] **Step 1: Write `frontend/components/NotificationHost.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { NearbyIncident } from "@pulso/core";
import { config, decideAlertTier, getNearbyIncidents, subscribeToIncidents } from "@/lib";
import NotificationToast from "./NotificationToast";
import NotificationBottomSheet from "./NotificationBottomSheet";

// Live 3-tier notifier (FR-17). Mounted once in the (app) shell. On a Realtime incident change
// it refetches nearby incidents; a genuinely-new one raises a bottom sheet (severe AND close) or
// a discreet toast. The notification center screen lists them all. Pre-existing incidents at
// mount are seeded into `seen` so we never blast alerts for what was already on the map.
function ageLabel(createdAt: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.round(mins / 60)} h`;
}

export default function NotificationHost() {
  const router = useRouter();
  const [sheet, setSheet] = useState<NearbyIncident | null>(null);
  const [toast, setToast] = useState<{ id: string; title: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const loc = useRef({ lat: config.defaultLat, long: config.defaultLng });

  const surface = useCallback((incident: NearbyIncident) => {
    const tier = decideAlertTier({
      severity: incident.severity,
      distanceMeters: incident.distance_meters,
    });
    if (tier === "sheet") setSheet(incident);
    else setToast({ id: incident.id, title: incident.title });
  }, []);

  const refresh = useCallback(async () => {
    let rows: NearbyIncident[];
    try {
      rows = await getNearbyIncidents({ lat: loc.current.lat, long: loc.current.long });
    } catch {
      return; // a transient query error must not crash the shell
    }
    if (!seeded.current) {
      rows.forEach((r) => seen.current.add(r.id));
      seeded.current = true;
      return;
    }
    for (const row of rows) {
      if (seen.current.has(row.id)) continue;
      seen.current.add(row.id);
      surface(row); // only the most recent new incident stays visible per surface
    }
  }, [surface]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        loc.current = { lat: pos.coords.latitude, long: pos.coords.longitude };
        void refresh();
      },
      () => void refresh(),
    );
    const channel = subscribeToIncidents(() => void refresh());
    return () => {
      void channel.unsubscribe();
    };
  }, [refresh]);

  return (
    <>
      {toast && (
        <NotificationToast
          title={toast.title}
          onDismiss={() => setToast(null)}
          onOpen={() => {
            setToast(null);
            router.push("/notifications");
          }}
        />
      )}
      {sheet && (
        <NotificationBottomSheet
          title={sheet.title}
          distanceMeters={sheet.distance_meters}
          ageLabel={ageLabel(sheet.created_at)}
          onViewOnMap={() => {
            setSheet(null);
            router.push("/");
          }}
          onDismiss={() => setSheet(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Barrel-export it**

Add to `frontend/components/index.ts`:

```ts
export { default as NotificationHost } from "./NotificationHost";
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/NotificationHost.tsx frontend/components/index.ts
git commit -m "feat(notifications): live 3-tier surfacer (sheet/toast) on Realtime inserts"
```

---

### Task 2: Mount the host in the (app) shell

**Files:**
- Modify: `frontend/app/(app)/layout.tsx` (created by F1 — same lane/person, sequential)

**Interfaces:**
- Consumes: `NotificationHost` from `@/components`.

- [ ] **Step 1: Render `<NotificationHost />` in the shell**

Replace `frontend/app/(app)/layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import { TabBar, NotificationHost } from "@/components";

// Post-login shell: scrollable content above a persistent bottom tab bar, plus the live
// notification surfacer (FR-17) that overlays sheets/toasts on any screen.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <NotificationHost />
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 2: Ensure the shell is a positioning context**

`NotificationToast` (`top-24`) and `NotificationBottomSheet` (`bottom-3.5`) are absolutely
positioned. Confirm `.app-shell` in `frontend/app/globals.css` has `position: relative` (and a
mobile max-width column). If it does not, add `position: relative;` to the `.app-shell` rule so
the overlays anchor to the shell rather than the viewport.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(app)/layout.tsx" frontend/app/globals.css
git commit -m "feat(notifications): mount NotificationHost in the app shell"
```

---

### Task 3: Verify the three tiers

**Files:** none (verification only). Requires B1's schema + Realtime running.

- [ ] **Step 1: Run the app and open any (app) screen**

Run: `cd frontend && npm run dev`; sign in; stay on the Mapa tab. Grant location.

- [ ] **Step 2: Insert a SEVERE, CLOSE incident → expect the bottom sheet**

In another terminal (offset ~0.001° ≈ 100 m from your location; use your granted coords or the
default center):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  insert into public.incidents (title, description, category, severity, status, location)
  values ('Incendio de prueba','demo','fire',5,'provisional',
          extensions.st_point(-80.45435, -1.05448)::extensions.geography);
"
```
Expected: within ~1–2 s a **bottom sheet** "Alerta cerca de ti" appears with the title, distance,
and age (severity 5 ≥ min AND < radius).

- [ ] **Step 3: Insert a LOW-severity / FAR incident → expect a toast**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  insert into public.incidents (title, description, category, severity, status, location)
  values ('Evento lejano de prueba','demo','public_event',1,'confirmed',
          extensions.st_point(-80.4450, -1.0460)::extensions.geography);
"
```
Expected: a discreet **toast** appears (relevant but not urgent) and auto-dismisses after ~5 s.

- [ ] **Step 4: Open the notification center**

Tap the bell in the map top bar → `/notifications`. Expected: both test incidents are listed,
each tagged **Alerta** or **Aviso** by the same `decideAlertTier` rule (FR-18).

- [ ] **Step 5: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(notifications): 3-tier surfacing verified (sheet/toast/center)"
```

---

## Notes / optional
- **Bell unread count:** the bell lives in the map top bar (`IncidentMap` renders
  `NotificationBell` with its own `unread` prop). Wiring a precise cross-component unread count
  from the host would need a shared store; it is out of scope here (the live sheet/toast is the
  FR-17 deliverable). Leave the bell's existing badge as-is for the demo.

## Self-review notes
- **Coverage:** FR-17 (sheet when severe AND close via `decideAlertTier`, else toast, always
  center) ✓; FR-18 (center list — pre-existing) ✓; FR-19 (env thresholds via `config`) ✓.
- **Shared file:** `(app)/layout.tsx` is created by F1 and extended here — same person, sequential,
  no cross-lane conflict.
- **Lane:** only `frontend/**`.
