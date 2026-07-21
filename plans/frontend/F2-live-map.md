# F2 — Live Map Implementation Plan

> ⚠️ **Amended by B6/F7 (2026-07-21, ADR-020):** `IncidentDetails` no longer carries
> `reporter_name` — reports are anonymous to users. Where this plan shows `reporter_name`,
> read `reporter_verified` only.

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**`)
**Goal:** Render the live incident map (pins by category/severity), open a per-incident detail
sheet with confirm/dispute, and keep the map fresh via Supabase Realtime.
**Depends on:** **B1 (schema + H0)** must be applied for a green typecheck. Specifically B1's
**H0-A** (`get_nearby_incidents` returns `lng`/`lat`) and **H0-B** (`NearbyIncident` /
`IncidentDetails` in `@pulso/core` are snake_case and carry `lng`/`lat`,
`reporter_name`/`reporter_verified`). This plan **consumes** those types; it never edits
`core/domain` or `plans/CONTRACT.md` (B1 owns them). If B1 has not landed yet you can still
write the code, but `npm run typecheck` will only pass once B1's domain change is in.
**Reads from CONTRACT:** §2 (shared types), §3.2 (`get_nearby_incidents`, `get_incident_details`,
`confirm_incident`), §3.4 (Realtime), §6 (env split).

## Global Constraints (apply to every task)
- No hardcoded URLs / keys / thresholds — everything via env (`.env.local` for `NEXT_PUBLIC_*`
  on the frontend). Map center / zoom / radius already come from `config` (CONTRACT §6). Do not
  inline coordinates or radii.
- One class / function / component per file. Re-export through the package/dir barrel
  (`frontend/lib/index.ts`, `frontend/components/index.ts`); consumers import from the barrel
  (`@/lib`, `@/components`), never a deep file.
- UI copy in **Spanish** (Ecuador locale). Code comments, commit messages, this doc → **English**.
- Commit convention: Conventional Commits in English (`feat:`, `fix:`, `chore:` …).
- TypeScript: no `any` in app code; explicit types on exported functions; `import type` for
  type-only imports (the frontend imports **types only** from `@pulso/core`).

## Scope note (read before you start)
The repo is further along than a bare skeleton. The App Router pages and the `lib`/components
touched here **already exist**, but `frontend/lib/incidents.ts`, `IncidentMap.tsx`, and
`IncidentDetailSheet.tsx` were written against the **pre-H0 camelCase** domain
(`distanceMeters`, `createdAt`, `reporterName`, optional `lng?`/`lat?`). B1 flips the
`@pulso/core` types to **snake_case + required `lng`/`lat`**. This plan's real work is
**migrating the frontend consumers to the post-H0 shapes** so pins render and the sheet is
typed. Do NOT re-scaffold routes that already exist — confirm, then edit.

## FR / ADR coverage
| Task | Covers |
|---|---|
| 1 | FR-9 (map is the post-login home screen) |
| 2 | FR-9 (map data), FR-20/FR-21 (confirm/dispute data path); consumes H0-A + H0-B |
| 3 | FR-9 (active pins colored by category/severity), FR-10 (with Task 5) |
| 4 | FR-20, FR-21, ADR-018 (confirm/dispute via `kind`) + reporter-verified trust badge |
| 5 | FR-10 (all maps update ~1–2s on insert/update/delete); FR-11 (only active incidents shown) |

---

### Task 1: Confirm the map route + app shell are mounted

**Files:**
- Confirm (create only if missing): `frontend/app/(app)/page.tsx`
- Confirm (create only if missing): `frontend/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `IncidentMap`, `TabBar` from `@/components` (both already barrel-exported).
- Produces: the `/` route rendering the map inside the tab-bar shell.

- [ ] **Step 1: Confirm `app/(app)/page.tsx` mounts the map.** The route group `(app)` does not
  add a path segment, so this file is the default `/` route. It should be exactly:

```tsx
import { IncidentMap } from "@/components";

// Mapa — the home screen after login.
export default function MapPage() {
  return <IncidentMap />;
}
```

- [ ] **Step 2: Confirm `app/(app)/layout.tsx` wraps children with the tab bar.** It should be
  exactly:

```tsx
import type { ReactNode } from "react";
import { TabBar } from "@/components";

// Post-login shell: scrollable content above a persistent bottom tab bar.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run dev` then open http://localhost:3000
Expected: the map screen loads with the bottom tab bar visible. (Pins may not render yet —
Tasks 2 & 3 fix that. You only need to see the map canvas + tab bar mount without a routing
error.)

- [ ] **Step 4: Commit** — only if you had to create/change either file. If both already matched,
  skip the commit and move on.

```bash
git add frontend/app/(app)/page.tsx frontend/app/(app)/layout.tsx
git commit -m "feat(map): mount live map as the post-login home route"
```

---

### Task 2: Migrate `lib/incidents.ts` to the post-H0 snake_case rows (direct cast)

**Files:**
- Modify: `frontend/lib/incidents.ts`
- Confirm (no change expected): `frontend/lib/index.ts`

**Interfaces:**
- Consumes: post-H0 `@pulso/core` types `NearbyIncident` (now snake_case + `lng`/`lat`),
  `IncidentDetails` (+ `reporter_name`, `reporter_verified`), `Category`, `ConfirmationKind`,
  `IncidentStatus`; the `supabase` browser client; `config.defaultRadiusMeters`.
- Consumes RPCs (B1-owned, CONTRACT §3.2): `get_nearby_incidents(user_lat, user_long,
  radius_meters, filter_category)`, `get_incident_details(target_id)`,
  `confirm_incident(target_id, kind)`.
- Produces: `getNearbyIncidents`, `getIncidentDetails`, `confirmIncident`,
  `subscribeToIncidents` (all already barrel-exported from `@/lib`).

- [ ] **Step 1: Rewrite the file to cast RPC rows directly to the domain types.** Post-H0 the RPC
  rows are snake_case and match `NearbyIncident` / `IncidentDetails` 1:1 (CONTRACT §2, H0-B), so
  the manual camelCase remap and the `clampSeverity` import are removed. Replace the entire file
  with:

```ts
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Category,
  ConfirmationKind,
  IncidentDetails,
  IncidentStatus,
  NearbyIncident,
} from "@pulso/core";
import { supabase } from "./supabase";
import { config } from "./config";

// Thin data clients (no hexagon inside React). They call the same PostGIS RPCs the
// agent-tools function uses. Post-H0 the RPC rows are snake_case and include lng/lat
// (H0-A/H0-B), so they map 1:1 onto the @pulso/core rows and we cast directly instead of
// re-shaping field by field (see CONTRACT §2 and §3.2).

// Fetch active incidents near a point via the get_nearby_incidents RPC.
export async function getNearbyIncidents(params: {
  lat: number;
  long: number;
  radiusMeters?: number;
  category?: Category | null;
}): Promise<NearbyIncident[]> {
  const { data, error } = await supabase.rpc("get_nearby_incidents", {
    user_lat: params.lat,
    user_long: params.long,
    radius_meters: params.radiusMeters ?? config.defaultRadiusMeters,
    filter_category: params.category ?? null,
  });
  if (error) throw error;
  return (data ?? []) as NearbyIncident[];
}

// One incident's public detail (no reporter PII beyond display_name + verified flag).
export async function getIncidentDetails(
  incidentId: string,
): Promise<IncidentDetails | null> {
  const { data, error } = await supabase.rpc("get_incident_details", {
    target_id: incidentId,
  });
  if (error) throw error;
  const rows = (data ?? []) as IncidentDetails[];
  return rows[0] ?? null;
}

// Register a confirm/dispute vote. user_id is derived server-side from the JWT (the RPC is
// security definer); it is never trusted from the client. See ADR-018.
export async function confirmIncident(
  incidentId: string,
  kind: ConfirmationKind,
): Promise<{ id: string; confirmations: number; status: IncidentStatus }> {
  const { data, error } = await supabase.rpc("confirm_incident", {
    target_id: incidentId,
    kind,
  });
  if (error) throw error;

  const row = ((data ?? [])[0] ?? {}) as {
    id?: string;
    confirmations?: number;
    status?: IncidentStatus;
  };
  return {
    id: row.id ?? incidentId,
    confirmations: row.confirmations ?? 0,
    status: row.status ?? "provisional",
  };
}

// Subscribe to every insert/update/delete on incidents. Postgres Changes is the fastest
// path for the MVP; the callback typically re-runs getNearbyIncidents to refresh the map.
export function subscribeToIncidents(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("incidents-map")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "incidents" },
      () => onChange(),
    )
    .subscribe();
}
```

- [ ] **Step 2: Confirm the barrel already exports all four.** `frontend/lib/index.ts` should
  already contain (leave unchanged if so):

```ts
export {
  getNearbyIncidents,
  getIncidentDetails,
  confirmIncident,
  subscribeToIncidents,
} from "./incidents";
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run typecheck`
Expected: no errors. In particular, no "Property 'distanceMeters' does not exist" or
"Property 'lng' does not exist" — that confirms the file now consumes B1's post-H0 snake_case
types. (If typecheck complains that `lng`/`lat`/`reporter_name` are missing on the domain types,
B1's H0 change has not been applied yet — that is the expected blocker, not a bug in this file.)

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/incidents.ts
git commit -m "refactor(incidents): consume post-H0 snake_case rows with lng/lat"
```

---

### Task 3: Update `IncidentMap.tsx` to consume required `lng`/`lat` and render every pin

**Files:**
- Modify: `frontend/components/IncidentMap.tsx`

**Interfaces:**
- Consumes: `NearbyIncident` (post-H0, required `lng`/`lat`), `Category` from `@pulso/core`;
  `config`, `getNearbyIncidents`, `subscribeToIncidents` from `@/lib`; sibling components
  `NotificationBell`, `IncidentDetailSheet`.
- Produces: the rendered live map (self-contained, no exports beyond the default component).

- [ ] **Step 1: Drop the defensive optional-coordinate handling.** Remove the local
  `type MapIncident = NearbyIncident & { lng?: number; lat?: number }` and the stale note about
  the RPC not returning coordinates; type state as `NearbyIncident[]`; render a pin for every
  incident (no `inc.lat != null && inc.lng != null` guard) since `lng`/`lat` are now required.
  Replace the entire file with:

```tsx
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useState } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Category, NearbyIncident } from "@pulso/core";
import { config, getNearbyIncidents, subscribeToIncidents } from "@/lib";
import NotificationBell from "./NotificationBell";
import IncidentDetailSheet from "./IncidentDetailSheet";

// Live map. Renders MapLibre, loads nearby incidents, subscribes to Realtime, and opens the
// detail sheet on a pin tap. A top bar shows the sector + the notifications bell.
//
// Post-H0 get_nearby_incidents returns lng/lat on every row (see CONTRACT §2, H0-A), so every
// incident is a pin — no optional-coordinate guard is needed.

const CATEGORY_COLOR: Record<Category, string> = {
  fire: "var(--sev-fire)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  road_closure: "var(--sev-road)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

export default function IncidentMap() {
  const [center, setCenter] = useState({
    lat: config.defaultLat,
    long: config.defaultLng,
  });
  const [incidents, setIncidents] = useState<NearbyIncident[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await getNearbyIncidents({
        lat: center.lat,
        long: center.long,
      });
      setIncidents(rows);
    } catch {
      // A transient query error should not blank the map; keep the last good state.
    }
  }, [center.lat, center.long]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, long: pos.coords.longitude }),
      () => {
        /* fall back to the configured default center */
      },
    );
  }, []);

  useEffect(() => {
    void refresh();
    const channel = subscribeToIncidents(() => void refresh());
    return () => {
      void channel.unsubscribe();
    };
  }, [refresh]);

  return (
    <div className="relative flex-1">
      <Map
        reuseMaps
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: center.lat,
          longitude: center.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={center.lat} longitude={center.long}>
          <span className="block h-4 w-4 rounded-full border-2 border-[#06120f] bg-accent shadow-[0_0_14px_var(--accent)]" />
        </Marker>

        {incidents.map((inc) => (
          <Marker
            key={inc.id}
            latitude={inc.lat}
            longitude={inc.lng}
            onClick={() => setSelected(inc.id)}
          >
            <span
              className="block h-3.5 w-3.5 rounded-[50%_50%_50%_2px] shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
              style={{
                background: CATEGORY_COLOR[inc.category] ?? "var(--muted)",
                transform: "rotate(45deg)",
              }}
            />
          </Marker>
        ))}
      </Map>

      {/* Top bar: sector + bell */}
      <div className="absolute inset-x-3.5 top-11 z-10 flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-[rgba(18,25,34,0.92)] px-3 py-2.5 backdrop-blur">
          <div>
            <div className="text-[13px] font-semibold">{config.venueName}</div>
            <div className="text-[10.5px] text-muted">
              {config.venueCity} · {Math.round(config.defaultRadiusMeters / 1000)} km
            </div>
          </div>
        </div>
        <NotificationBell unread={incidents.length ? 1 : 0} />
      </div>

      {/* Bottom sheet summary */}
      {!selected && (
        <div className="absolute inset-x-0 bottom-0 z-[3] rounded-t-[20px] border-t border-line bg-panel px-3.5 pb-3.5 pt-3">
          <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-line" />
          <h3 className="m-0 mb-2 text-[13px] font-semibold text-muted">
            Cerca de ti · <b className="text-ink">{incidents.length} incidentes activos</b>
          </h3>
          <div className="flex flex-col">
            {incidents.slice(0, 3).map((inc) => (
              <button
                key={inc.id}
                type="button"
                onClick={() => setSelected(inc.id)}
                className="flex items-center gap-3 border-t border-line py-2.5 text-left first:border-t-0"
              >
                <span
                  className="h-8 w-1 flex-none rounded"
                  style={{ background: CATEGORY_COLOR[inc.category] ?? "var(--muted)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {inc.title}
                  </span>
                  <span className="text-[11.5px] text-muted">{inc.status}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <IncidentDetailSheet incidentId={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev` and open http://localhost:3000
Expected: typecheck is clean (no `lng?`/`lat?` optional-narrowing left). With B1's seed applied
(`supabase db reset`), the seeded incidents appear as diamond pins colored by category, and the
bottom summary reads "N incidentes activos". If geolocation is denied, the map stays on the
configured default center (Portoviejo) — pins still render.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/IncidentMap.tsx
git commit -m "fix(map): render pins from required lng/lat on nearby incidents"
```

---

### Task 4: Rewrite `IncidentDetailSheet.tsx` — typed details, verified badge, confirm/dispute

**Files:**
- Modify: `frontend/components/IncidentDetailSheet.tsx`

**Interfaces:**
- Consumes: `IncidentDetails` (post-H0: `reporter_name`, `reporter_verified`, `status`,
  `severity`, `confirmations`, `description`), `IncidentStatus` from `@pulso/core`;
  `getIncidentDetails`, `confirmIncident` from `@/lib`.
- Produces: the detail bottom sheet with confirm/dispute actions (ADR-018).

- [ ] **Step 1: Replace the direct `supabase.rpc` calls with the `@/lib` data clients and drop
  the `Record<string, unknown>` casting.** The details are now strongly typed, so read fields
  directly (`details.severity`, `details.reporter_name`, etc.), add a Spanish status label map,
  and show a "Verificado" badge when the reporter's identity is verified. Replace the entire
  file with:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { IncidentDetails, IncidentStatus } from "@pulso/core";
import { confirmIncident, getIncidentDetails } from "@/lib";

// Spanish labels for the incident lifecycle status (UI copy is Spanish, Ecuador locale).
const STATUS_LABEL: Record<IncidentStatus, string> = {
  provisional: "Provisional",
  confirmed: "Confirmado",
  disputed: "En disputa",
  resolved: "Resuelto",
};

// Bottom sheet for one incident: reporter, description, community confirmations, and the
// confirm / dispute actions. Both map to the confirm_incident RPC (kind = confirm|dispute);
// at threshold the status flips to "confirmed" / "disputed". user_id comes from the JWT.
export default function IncidentDetailSheet({
  incidentId,
  onClose,
}: {
  incidentId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<IncidentDetails | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getIncidentDetails(incidentId)
      .then((row) => {
        if (active) setDetails(row);
      })
      .catch(() => {
        // Leave the sheet in its loading state on a transient error.
      });
    return () => {
      active = false;
    };
  }, [incidentId]);

  async function vote(kind: "confirm" | "dispute") {
    setBusy(true);
    try {
      await confirmIncident(incidentId, kind);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[85%] flex-col rounded-t-[20px] border-t border-line bg-panel">
      <div className="mx-auto my-2.5 h-1 w-9 rounded-full bg-line" />
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="text-[19px] font-extrabold tracking-tight">
          {details?.title ?? "Incidente"}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          <span>Severidad {details?.severity ?? "—"}</span>
          <span>·</span>
          <span>{details ? STATUS_LABEL[details.status] : "—"}</span>
          {details?.reporter_name ? (
            <>
              <span>·</span>
              <span>Reportado por {details.reporter_name}</span>
              {details.reporter_verified ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-accent"
                  style={{
                    borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))",
                  }}
                  title="Identidad verificada"
                >
                  <svg
                    width={10}
                    height={10}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Verificado
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#c7d0da]">
          {details?.description ?? "Cargando detalle…"}
        </p>
        <div className="mt-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-[12px] text-muted">
          {details?.confirmations ?? 0} confirmaron · ¿lo estás viendo? Ayuda a la
          comunidad a verificarlo.
        </div>
      </div>
      <div className="flex gap-2.5 border-t border-line bg-bg px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => vote("confirm")}
          className="flex w-full items-center justify-center rounded-[14px] bg-ok px-3 py-3 text-sm font-bold text-[#04140b] disabled:opacity-60"
        >
          Confirmar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => vote("dispute")}
          className="flex w-full items-center justify-center rounded-[14px] border bg-panel-2 px-3 py-3 text-sm font-bold text-sev-fire disabled:opacity-60"
          style={{ borderColor: "color-mix(in srgb, var(--sev-fire) 45%, var(--line))" }}
        >
          No es correcto
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev`, open http://localhost:3000, tap a pin
Expected: typecheck clean. Tapping a pin opens the sheet showing the title, `Severidad N`, the
Spanish status label, and (when the reporter is verified) a teal "Verificado" badge next to the
reporter's name. Tapping **Confirmar** or **No es correcto** posts to `confirm_incident` and
closes the sheet. Tapping the same incident again reflects the updated confirmations count once
the map refreshes (Realtime, Task 5). A second vote of the other kind switches your vote
(one vote per user — ADR-018).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/IncidentDetailSheet.tsx
git commit -m "feat(map): typed incident detail sheet with verified badge and confirm/dispute"
```

---

### Task 5: Verify the Realtime subscription refreshes the map on insert

**Files:**
- None (verification only — the subscription is already wired in `IncidentMap.tsx` via
  `subscribeToIncidents`, confirmed in Task 3).

**Interfaces:**
- Consumes: `subscribeToIncidents` (CONTRACT §3.4 — channel on `public.incidents`, event `*`).
- Produces: nothing new; this task proves FR-10 end to end.

- [ ] **Step 1: Confirm the wiring is present** in `frontend/components/IncidentMap.tsx` (from
  Task 3): the effect subscribes on mount and unsubscribes on unmount —

```tsx
useEffect(() => {
  void refresh();
  const channel = subscribeToIncidents(() => void refresh());
  return () => {
    void channel.unsubscribe();
  };
}, [refresh]);
```

- [ ] **Step 2: Verify live update**

Run: with `supabase start` up and `npm run dev` running, open http://localhost:3000 in two
browser windows side by side. In Supabase Studio (or via `supabase db` SQL) insert an active
incident near the map center, e.g.:

```sql
insert into public.incidents
  (reporter_id, title, description, category, severity, location, expires_at)
values
  (auth.uid(), 'Prueba en vivo', 'Insertado desde Studio', 'accident', 3,
   extensions.st_point(-80.45445, -1.05458)::extensions.geography,
   now() + interval '6 hours');
```

Expected: within ~1–2 seconds a new pin appears on **both** open maps and the "N incidentes
activos" count increments — the `postgres_changes` callback re-ran `getNearbyIncidents`
(FR-10). Deleting or expiring the row (past `expires_at`) drops it from the active view on the
next change (FR-11: the RPC only returns non-expired incidents).

> Note: Realtime on `public.incidents` must be enabled in B1's migration
> (`alter publication supabase_realtime add table public.incidents`). If pins never update, that
> publication line is missing on the backend — flag it to the B1 owner; it is not a frontend fix.

- [ ] **Step 3: Commit** — verification only, nothing to commit. Skip.

---

## Done criteria
- `cd frontend && npm run typecheck` is clean (with B1's H0 applied).
- The map renders seeded pins by category, opens a typed detail sheet with a verified badge, and
  confirm/dispute post to `confirm_incident`.
- Inserting an incident updates every open map within ~1–2s.
