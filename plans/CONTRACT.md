# Pulso — Frontend ↔ Backend Contract (FROZEN)

**This is the single seam between the three work lanes.** Freeze it during the B1+B6
bootstrap gate. Every lane codes against it; only Person B edits it during that gate.
Later changes require an explicit three-person sync and must never be concurrent edits.

> Related: [`00-README.md`](00-README.md) (ownership matrix + how to run with Codex),
> `docs/ARCHITECTURE.md` (system design), `docs/DATA-MODEL.md` (canonical schema/SQL).

---

## 1. Lane ownership (non-collision rule)

| Lane | May edit ONLY | Owner |
|---|---|---|
| **Frontend** | `frontend/**` | Person A |
| **Backend** | `backend/supabase/**`, `backend/core/**`, `backend/adapters/**`, excluding the messaging carve-out below | Person B |
| **Integrations & delivery** | `backend/core/ports/messaging-gateway.ts`, `backend/core/use-cases/dispatch-proximity-alerts.ts`, `backend/adapters/messaging/**`, `backend/supabase/functions/proximity-dispatcher/**`, Hermes keys in `_shared/env.ts`, `docs/hermes/**`, deployment operations, and delivery docs | Person C |

**Shared / frozen (change only by explicit agreement, ideally never after H0):**
`backend/core/domain` type unions (the type contract below), `backend/supabase/migrations/**` (the schema),
root `package.json` / `tsconfig.base.json`, and this file.

The frontend imports **types and pure domain helpers only** from `@pulso/core`
(`import type { … }` plus side-effect-free constants/functions like `CATEGORY_VALUES` and
`clampSeverity`). It never imports adapters, use-cases, or any I/O code from
`backend/core/` or `backend/adapters/`.

---

## 2. Shared type contract (from `@pulso/core`, type-only import on the frontend)

```ts
type Category = 'road_closure' | 'accident' | 'flood' | 'fire' | 'public_event' | 'other'
type IncidentStatus = 'provisional' | 'confirmed' | 'disputed' | 'resolved'
type VerificationMethod = 'registry' | 'algorithmic'
type Severity = 1 | 2 | 3 | 4 | 5

type NearbyIncident = {
  id: string; title: string; description: string | null; category: Category
  severity: Severity; status: IncidentStatus; distance_meters: number
  confirmations: number; created_at: string; lng: number; lat: number
}
// One incident's public view: everything in NearbyIncident except distance_meters
// (a single-incident lookup has no user origin to measure from), plus reporter_verified.
// Anonymous by design (ADR-020): no reporter identity ever crosses this seam.
type IncidentDetails = Omit<NearbyIncident, 'distance_meters'> & {
  reporter_verified: boolean
}
```

---

## 3. Supabase direct access (frontend uses the browser client: anon key + user JWT)

All of this is governed by **Postgres RLS** — the frontend can call it directly; the backend
lane owns the tables, RLS policies, and RPC bodies.

### 3.1 Auth
- `supabase.auth.signUp({ email, password })`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.getSession()` / `onAuthStateChange` / `signOut()`

### 3.2 RPCs callable directly from the client
| RPC | Args | Returns |
|---|---|---|
| `get_nearby_incidents` | `user_lat` float, `user_long` float, `radius_meters` int (default 3000), `filter_category` text\|null | rows of `NearbyIncident` (≤20, ordered by distance) |
| `get_incident_details` | `target_id` uuid | one `IncidentDetails` (anonymous: no reporter identity, only `reporter_verified` — ADR-020) |
| `confirm_incident` | `target_id` uuid, `kind` `'confirm' \| 'dispute'` | `{ id, confirmations, status }`; authenticated-only restricted privileged RPC |

### 3.3 Table writes (RLS-guarded — client writes only its own rows)
- **Publish incident:** `insert into incidents` with `{ reporter_id = auth.uid(), title, description, category, severity, location (geography point via st_point(lng,lat)), photo_path, expires_at }`.
- **Safety config (owner-only, column-limited):** clients may edit settings/contact details,
  but never `whatsapp_config.verified`, `emergency_contacts.opt_in_status`, or dispatch logs.
- **Server-owned:** profile identity/trust fields, incident status/confirmation counts, and
  `incident_confirmations` rows. Clients reach voting only through `confirm_incident`.

### 3.4 Realtime (live map + notifications both subscribe)
```ts
supabase.channel('incidents-map') // each surface owns its channel name
  .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, cb)
  .subscribe()
```
> Map and notifications each own their own channel/subscription file — no shared file.

### 3.5 Storage
- Bucket `report-photos` (public read for the demo).
- Upload path: `report-photos/<auth.uid()>/<uuid>.jpg`. Client uploads, then passes the
  returned `photo_path` to `analyze-report` and stores it on the incident row.

---

## 4. Edge Functions (HTTP `POST`, `Authorization: Bearer <supabase access token>`)

Base URL: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/<name>`. The server derives `user_id`
from the JWT — **never** trust a `user_id` in the body.

| Function | Request body | Response |
|---|---|---|
| `verify-identity` | `{ cedula: string }` | success: `{ verified: true, method: VerificationMethod, profile: Profile }`; invalid identity: HTTP 422 `{ error }` |
| `analyze-report` | `{ photo_path: string }` | `{ category: Category, severity: Severity, title: string, description: string }` |
| `create-realtime-session` | `{ personaId: 'cerca' \| 'ruta', context?: { lat?: number, lng?: number } }` | `{ clientSecret: string, expiresAt: string, model: string, voice: string }` |
| `agent-tools` | `{ tool: 'get_nearby_incidents' \| 'get_incident_details' \| 'confirm_incident', arguments: object }` | speak-ready envelope over the §3.2 shapes: nearby → `{ total, radius_label, summary, incidents: NearbyIncident&labels[] }` (no lng/lat); details → `{ found, summary? , incident?: IncidentDetails&labels }` (no lng/lat, keeps `photo_path`); confirm → `{ id, confirmations, status, status_label, message }`. `&labels` = added `*_label` strings + `reported_minutes_ago` |
| `proximity-dispatcher` | incident webhook with `x-pulso-webhook-secret`; **manual SOS:** `{ type: 'sos', location: { lat: number, lng: number } }` with user JWT | `{ dispatched: number }` (successful sends only; one failed contact does not abort later contacts) |

Error envelope (all functions): non-2xx → `{ error: string }`.

---

## 5. Voice agent tool contracts (canonical names live in the backend)

`create-realtime-session` builds the tool JSON-schemas the model sees; the frontend bridges
the calls. Both sides must agree on **names + argument keys** (frozen here):

- `get_nearby_incidents({ radius_meters?: number, filter_category?: Category })` — the
  frontend injects the user's `{ user_lat, user_long }` from `navigator.geolocation` into
  the arguments before calling `agent-tools` (the model never invents coordinates).
- `get_incident_details({ incident_id: string })`
- `confirm_incident({ incident_id: string, kind: 'confirm' | 'dispute' })`

Bridge flow (frontend): OpenAI `response.function_call_arguments.done` → POST `agent-tools`
→ `conversation.item.create { function_call_output }` → `response.create`.

---

## 6. Environment split (never cross the line)

**Frontend (`frontend/.env.local`, exposed to browser — `NEXT_PUBLIC_*` only):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAP_STYLE_URL`,
`NEXT_PUBLIC_DEFAULT_LAT`, `NEXT_PUBLIC_DEFAULT_LNG`, `NEXT_PUBLIC_DEFAULT_ZOOM`,
`NEXT_PUBLIC_DEFAULT_RADIUS_METERS`, `NEXT_PUBLIC_ALERT_SEVERITY_MIN`,
`NEXT_PUBLIC_ALERT_RADIUS_METERS`, `NEXT_PUBLIC_VENUE_NAME`, `NEXT_PUBLIC_VENUE_CITY`,
`NEXT_PUBLIC_OPENAI_REALTIME_URL`.

**Backend (Supabase Edge secrets — never shipped to the browser):**
`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_REALTIME_MODEL`, `OPENAI_VISION_MODEL`,
`OPENAI_REALTIME_VOICE`, `CEDULA_HASH_PEPPER`, `IDENTITY_VERIFY_API_URL`,
`IDENTITY_VERIFY_API_KEY`, current `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WHATSAPP_FROM`,
future C1 `HERMES_WEBHOOK_URL`, `HERMES_WEBHOOK_SECRET`, `PROXIMITY_WEBHOOK_SECRET`, `MAX_RADIUS_METERS`,
`DEFAULT_RADIUS_METERS`, `INCIDENT_TTL_HOURS`, `CONFIRM_THRESHOLD`, `DISPUTE_THRESHOLD`,
`TRUST_VERIFIED_BONUS`, `TRUST_PER_CONFIRMED`, `TRUST_PER_DISPUTED`, `TIMEZONE`,
`DEFAULT_LANGUAGE`.

**Hermes VM/MCP process (server-only; never exposed to the browser or committed):**
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is scoped to the trusted VM
shim and must not appear in any `NEXT_PUBLIC_*` variable, client bundle, log, or chat transcript.

---

## 7. Git protocol (owned files + sequenced shared docs)

- Branch per plan: `feat/f2-live-map`, `feat/b2-identity`, …
- Application edits stay within the lane matrix. Person B completes the B1+B6 shared-file gate
  before Person C's documentation pass; shared docs are never edited concurrently.
- Commit convention: Conventional Commits in **English** (personal/SteveSant project).
