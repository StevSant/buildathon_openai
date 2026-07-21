# F3 — Report Flow Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**`)
**Goal:** Wire the report flow end-to-end — capture/upload a photo → upload to Storage →
`analyze-report` proposes structured fields → user reviews/edits (incl. a location fallback) →
publish an incident → return to the live map.
**Depends on:** Nothing to start (codes against the frozen CONTRACT). Full demo path needs
`B1` (schema/RLS/`incidents` table + `report-photos` bucket) and `B3` (`analyze-report` function)
applied; typecheck and UI render work without them.
**Reads from CONTRACT:** §2 (type contract: `Category`, `Severity`), §3.3 (table write:
`insert into incidents`), §3.5 (Storage `report-photos/<uid>/<uuid>.jpg`), §4 (`analyze-report`
request/response), §6 (env split).

**FRs covered:** FR-5 (capture/upload photo + attach geolocation), FR-6 (`analyze-report`
returns `category`/`severity`/`title`/`description`), FR-7 (user edits any field before
publishing), FR-8 (publish inserts an incident owned by the JWT user). Also mitigates PRD §8
risk (geolocation denied → manual location fallback).

## Global Constraints (apply to every task)
- No hardcoded URLs / keys / thresholds — everything via env, read through `@/lib` `config`
  (`NEXT_PUBLIC_*` only on the frontend). See CONTRACT §6. Default coordinates come from
  `config.defaultLat` / `config.defaultLng`, never inline literals.
- One concern per file; thin data-client functions grouped per-domain file under `frontend/lib/`
  (mirroring the existing `lib/incidents.ts`), re-exported through the `lib/index.ts` barrel.
  Consumers import from `@/lib`, never a deep file.
- UI copy in **Spanish** (Ecuador locale). Code comments, commit messages, this doc → **English**.
- Commit convention: Conventional Commits in English (`feat:`, `fix:`, `chore:` …).
- TypeScript: no `any` in app code; explicit types on exported functions; `import type` (or the
  inline `type` specifier) for type-only imports. The frontend imports **types** from
  `@pulso/core`, plus the pure runtime domain helpers it already relies on (`clampSeverity`,
  `CATEGORY_VALUES`) — never adapters/use-cases/other runtime code.

---

### Task 1: Report route mounts `ReportForm`

**Files:**
- Create (or confirm identical): `frontend/app/(app)/report/page.tsx`

**Interfaces:**
- Consumes: `ReportForm` from `@/components` (already exported in `frontend/components/index.ts`).
- Produces: the `/report` route under the `(app)` shell (persistent bottom `TabBar`).

- [ ] **Step 1: Ensure the route renders the form.** This file already exists in the scaffold;
  confirm it matches exactly (create it if missing). It stays a server component that mounts the
  client `ReportForm` — no logic here.

```tsx
import { ReportForm } from "@/components";

// Reportar — camera/upload → AI analysis → review → publish.
export default function ReportPage() {
  return <ReportForm />;
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run dev` → open http://localhost:3000/report
Expected: the "Nuevo reporte" screen renders inside the app shell with the bottom tab bar
visible, showing the photo drop-zone ("Toca para tomar o subir una foto"). No console errors.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(app)/report/page.tsx"
git commit -m "feat(report): mount ReportForm on the /report route"
```

---

### Task 2: Report data-client (`lib/report.ts`) — upload, analyze, locate, publish

**Files:**
- Create: `frontend/lib/report.ts`
- Modify: `frontend/lib/index.ts`

**Interfaces:**
- Consumes: `supabase` and `config` from the sibling `./supabase` / `./config` modules;
  `clampSeverity` and types `Category` / `Severity` from `@pulso/core`. Supabase Storage bucket
  `report-photos` (CONTRACT §3.5), the `analyze-report` edge function (CONTRACT §4), and the
  `incidents` table write (CONTRACT §3.3).
- Produces: `AnalyzedFields`, `ReportLocation`, `uploadReportPhoto`, `analyzeReport`,
  `getReportLocation`, `publishIncident` — all re-exported from `@/lib` for `ReportForm` (Task 3).

- [ ] **Step 1: Create the data-client module.** Mirrors the `lib/incidents.ts` pattern (thin
  clients, no hexagon inside React). Every cross-lane shape (`photo_path` body key, WKT insert,
  bucket path) follows the CONTRACT exactly. Write the complete file:

```ts
import { clampSeverity } from "@pulso/core";
import type { Category, Severity } from "@pulso/core";
import { supabase } from "./supabase";
import { config } from "./config";

// Thin data clients for the report flow (no hexagon inside React), mirroring lib/incidents.ts.
// They upload the photo, ask analyze-report for structured fields, resolve the reporter's
// location (with a denial fallback), and insert the published incident. RLS + the JWT are the
// real authorization boundary; reporter_id is always the signed-in user.

// Structured fields proposed by analyze-report and edited by the user before publishing.
export interface AnalyzedFields {
  category: Category;
  severity: Severity;
  title: string;
  description: string;
}

// Reporter location for the incident. isFallback is true when geolocation was denied/unavailable
// and we fell back to the configured default, so the UI can offer a manual adjustment.
export interface ReportLocation {
  lat: number;
  lng: number;
  isFallback: boolean;
}

// Upload the captured/selected photo to the public report-photos bucket and return its
// bucket-relative path (<uid>/<uuid>.jpg). That path is the photo_path stored on the incident
// and sent to analyze-report. See CONTRACT §3.5.
export async function uploadReportPhoto(file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sin sesión");

  const photoPath = `${uid}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("report-photos")
    .upload(photoPath, file, { contentType: file.type });
  if (error) throw error;
  return photoPath;
}

// Ask analyze-report (OpenAI vision + structured output) for suggested fields. The body key is
// snake_case photo_path per CONTRACT §4; the user is derived from the JWT server-side.
export async function analyzeReport(photoPath: string): Promise<AnalyzedFields> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sin sesión");

  const res = await fetch(`${config.functionsUrl}/analyze-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ photo_path: photoPath }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `analyze-report falló: ${res.status}`);
  }

  const raw = (await res.json()) as AnalyzedFields;
  // severity is external input — clamp it into the 1..5 domain before trusting it.
  return { ...raw, severity: clampSeverity(raw.severity) };
}

// Resolve the reporter's location. Never throws: on denial/unavailability it falls back to the
// configured default coordinates and flags isFallback so the UI can let the user adjust the pin.
// See PRD §8 (geolocation-denied risk).
export async function getReportLocation(): Promise<ReportLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: config.defaultLat, lng: config.defaultLng, isFallback: true };
  }
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
      }),
    );
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      isFallback: false,
    };
  } catch {
    return { lat: config.defaultLat, lng: config.defaultLng, isFallback: true };
  }
}

// Publish the reviewed incident. location is a PostGIS geography(point) written as an
// SRID-qualified WKT string with LONGITUDE FIRST (SRID=4326;POINT(lng lat)). reporter_id is the
// signed-in user; RLS enforces reporter_id = auth.uid(). status/confirmations/expires_at default
// server-side (expires_at from INCIDENT_TTL_HOURS, a backend-only secret). See CONTRACT §3.3.
export async function publishIncident(input: {
  fields: AnalyzedFields;
  photoPath: string;
  location: ReportLocation;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sin sesión");

  const { fields, photoPath, location } = input;
  const { error } = await supabase.from("incidents").insert({
    reporter_id: uid,
    title: fields.title,
    description: fields.description,
    category: fields.category,
    severity: fields.severity,
    location: `SRID=4326;POINT(${location.lng} ${location.lat})`,
    photo_path: photoPath,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Re-export from the barrel.** Add these lines to `frontend/lib/index.ts` after the
  existing `incidents` re-export block (keep the file's ordering/style):

```ts
export {
  uploadReportPhoto,
  analyzeReport,
  getReportLocation,
  publishIncident,
} from "./report";
export type { AnalyzedFields, ReportLocation } from "./report";
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run typecheck`
Expected: no type errors. In particular, `crypto.randomUUID()`, the `{ photo_path }` body, and
the `SRID=4326;POINT(...)` string all typecheck, and `AnalyzedFields` / `ReportLocation` resolve
from `@/lib`.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/report.ts frontend/lib/index.ts
git commit -m "feat(report): add report data-client (upload, analyze, locate, publish)"
```

---

### Task 3: Wire `ReportForm` to the data-client (review, publish, navigate, fallback)

**Files:**
- Modify: `frontend/components/ReportForm.tsx`

**Interfaces:**
- Consumes: `uploadReportPhoto`, `analyzeReport`, `getReportLocation`, `publishIncident`,
  `AnalyzedFields`, `ReportLocation` from `@/lib` (Task 2); `CATEGORY_VALUES` and types
  `Category` / `Severity` from `@pulso/core`; `useRouter` from `next/navigation`.
- Produces: the finished report UI. The map home route `/` (`frontend/app/(app)/page.tsx`, F2)
  is the navigation target after a successful publish.

This task fixes three scaffold defects: the analyze body key was `photoPath` (contract wants
`photo_path`); the insert used a bare `POINT(...)` without the `SRID=4326;` prefix; and there was
no post-publish navigation and no geolocation-denied fallback. Replace the whole component.

- [ ] **Step 1: Replace `frontend/components/ReportForm.tsx` with the complete component.**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_VALUES } from "@pulso/core";
import type { Category, Severity } from "@pulso/core";
import {
  analyzeReport,
  getReportLocation,
  publishIncident,
  uploadReportPhoto,
  type AnalyzedFields,
  type ReportLocation,
} from "@/lib";

// Report flow: capture/upload a photo → upload to Storage → analyze-report (OpenAI vision)
// proposes structured fields → user reviews/edits (incl. location on geolocation-denied) →
// publish (INSERT into incidents). Supabase Realtime then broadcasts the new incident to every
// map, and we navigate back to the map so the reporter sees their own pin.

// Spanish (Ecuador) labels for each canonical Category. Driven by CATEGORY_VALUES so the option
// set can never drift from the domain union.
const CATEGORY_LABELS: Record<Category, string> = {
  road_closure: "Cierre vial",
  accident: "Accidente",
  flood: "Inundación",
  fire: "Incendio",
  public_event: "Evento público",
  other: "Otro",
};

type Phase = "idle" | "analyzing" | "ready" | "publishing";

export default function ReportForm() {
  const router = useRouter();
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<AnalyzedFields | null>(null);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setPhase("analyzing");
    try {
      const path = await uploadReportPhoto(file);
      setPhotoPath(path);
      // Analyze the photo and resolve the location in parallel; both feed the review form.
      const [analyzed, resolved] = await Promise.all([
        analyzeReport(path),
        getReportLocation(),
      ]);
      setFields(analyzed);
      setLocation(resolved);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos analizar la foto");
      setPhase("idle");
    }
  }

  async function publish() {
    if (!fields || !photoPath || !location) return;
    setError(null);
    setPhase("publishing");
    try {
      await publishIncident({ fields, photoPath, location });
      // Back to the map — Realtime will surface the freshly published pin.
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos publicar el reporte");
      setPhase("ready");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4">
      <h1 className="text-base font-bold">Nuevo reporte</h1>

      <label className="relative flex h-[118px] cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border border-line bg-gradient-to-br from-[#2a3340] via-[#171f2a] to-[#20303b] text-[12px] text-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Tu foto" className="h-full w-full object-cover" />
        ) : (
          <span>Toca para tomar o subir una foto</span>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickPhoto}
        />
      </label>

      {phase === "analyzing" && (
        <p className="text-[12px] text-accent">La IA está analizando tu foto…</p>
      )}
      {error && <p className="text-[12px] text-sev-fire">{error}</p>}

      {fields && location && (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-panel p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-bold text-accent">
            La IA analizó tu foto
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Categoría
            </span>
            <select
              value={fields.category}
              onChange={(e) =>
                setFields({ ...fields, category: e.target.value as Category })
              }
              className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13.5px] text-ink"
            >
              {CATEGORY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Severidad: {fields.severity}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              value={fields.severity}
              onChange={(e) =>
                setFields({ ...fields, severity: Number(e.target.value) as Severity })
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Título
            </span>
            <input
              value={fields.title}
              onChange={(e) => setFields({ ...fields, title: e.target.value })}
              className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13.5px] font-semibold text-ink"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Descripción
            </span>
            <textarea
              value={fields.description}
              onChange={(e) => setFields({ ...fields, description: e.target.value })}
              rows={3}
              className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13px] text-ink"
            />
          </label>

          {location.isFallback && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2 p-2.5">
              <p className="text-[11px] text-sev-fire">
                No pudimos obtener tu ubicación. Usamos una ubicación aproximada; ajústala si es
                necesario.
              </p>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                    Latitud
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={location.lat}
                    onChange={(e) =>
                      setLocation({ ...location, lat: Number(e.target.value) })
                    }
                    className="rounded-lg border border-line bg-panel px-2.5 py-2 text-[13px] text-ink"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                    Longitud
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={location.lng}
                    onChange={(e) =>
                      setLocation({ ...location, lng: Number(e.target.value) })
                    }
                    className="rounded-lg border border-line bg-panel px-2.5 py-2 text-[13px] text-ink"
                  />
                </label>
              </div>
            </div>
          )}

          <p className="text-[11px] text-faint">
            Puedes editar cualquier campo antes de publicar.
          </p>

          <button
            type="button"
            disabled={phase === "publishing"}
            onClick={publish}
            className="flex w-full items-center justify-center rounded-[14px] bg-accent px-3 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {phase === "publishing" ? "Publicando…" : "Publicar incidente"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify (types).**

Run: `cd frontend && npm run typecheck`
Expected: no type errors. `CATEGORY_VALUES`, `useRouter`, and every `@/lib` symbol resolve; the
component compiles with no `any`.

- [ ] **Step 3: Verify (full demo path).** This exercises Storage + `analyze-report` + the
  `incidents` insert, so it needs the backend applied.

Run (two terminals): `supabase start && supabase functions serve analyze-report --no-verify-jwt`
in one, `cd frontend && npm run dev` in the other. Sign in first (F1), then open
http://localhost:3000/report.
Expected: pick/take a photo → "La IA está analizando tu foto…" → the review card pre-fills
`Categoría` (Spanish label), a `Severidad` 1–5 slider, `Título`, and `Descripción`, all editable.
Edit any field, then tap "Publicar incidente" → the app navigates to the map (`/`) and, once F2
is in place, the new pin appears via Realtime.
Fallback check: block/deny the browser location permission, then repeat — the review card shows
the amber "usamos una ubicación aproximada" notice with editable `Latitud` / `Longitud` inputs
(prefilled from `NEXT_PUBLIC_DEFAULT_LAT`/`_LNG`); publishing still succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ReportForm.tsx
git commit -m "fix(report): correct analyze body/WKT, add navigation + geolocation fallback"
```

---

## Self-review (author checklist — do not include in execution)

1. **Coverage:** FR-5 (Task 2 `uploadReportPhoto`+`getReportLocation`, Task 3 capture UI),
   FR-6 (Task 2 `analyzeReport`, Task 3 prefill), FR-7 (Task 3 editable review), FR-8 (Task 2
   `publishIncident`, Task 3 publish), PRD §8 geolocation risk (Task 2 `getReportLocation`
   fallback + Task 3 manual-coords UI). All mapped.
2. **Placeholder scan:** no banned phrases; every code step is a complete file/block.
3. **Symbol consistency:** `photo_path` body key + `SRID=4326;POINT(lng lat)` WKT (lng first) +
   `report-photos/<uid>/<uuid>.jpg` path all match CONTRACT §3.3/§3.5/§4; `analyze-report`
   response is `{ category, severity, title, description }` (CONTRACT §4).
4. **Lane check:** only `frontend/**` touched.
5. **H0 compliance:** report flow does not read `NearbyIncident`/`IncidentDetails`, so no
   `lng`/`lat`/snake_case consumption is required here; nothing from `core/domain` is redefined.
