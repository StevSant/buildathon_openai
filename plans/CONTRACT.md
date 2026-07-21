# Pulso — Frontend ↔ Backend Contract (FROZEN)

**This is the single seam between the two work lanes.** Freeze it at kickoff (H0). Both
lanes code against it in parallel; neither edits the other's files. Any change here is a
30-second sync between the two people, never a concurrent edit.

> Related: [`00-README.md`](00-README.md) (ownership matrix + how to run with Codex),
> `docs/ARCHITECTURE.md` (system design), `docs/DATA-MODEL.md` (canonical schema/SQL).

---

## 1. Lane ownership (non-collision rule)

| Lane | May edit ONLY | Owner |
|---|---|---|
| **Frontend** | `frontend/**` | Person A |
| **Backend** | `backend/supabase/**`, `backend/core/**`, `backend/adapters/**` | Person B |

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
// (a single-incident lookup has no user origin to measure from), plus the reporter fields.
type IncidentDetails = Omit<NearbyIncident, 'distance_meters'> & {
  reporter_name: string | null; reporter_verified: boolean
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
| `get_incident_details` | `target_id` uuid | one `IncidentDetails` (no reporter PII beyond `display_name` + `verified`) |
| `confirm_incident` | `target_id` uuid, `kind` `'confirm' \| 'dispute'` | `{ id, confirmations, status }` |

### 3.3 Table writes (RLS-guarded — client writes only its own rows)
- **Publish incident:** `insert into incidents` with `{ reporter_id = auth.uid(), title, description, category, severity, location (geography point via st_point(lng,lat)), photo_path, expires_at }`.
- **Safety config (owner-only CRUD):** `whatsapp_config`, `emergency_contacts`, `alert_rules`.

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
| `verify-identity` | `{ cedula: string }` | `{ verified: true, method: VerificationMethod, profile: Profile }` \| `{ verified: false, reason: string }` |
| `analyze-report` | `{ photo_path: string }` | `{ category: Category, severity: Severity, title: string, description: string }` |
| `create-realtime-session` | `{ personaId: 'cerca' \| 'ruta', context?: { lat?: number, lng?: number } }` | `{ clientSecret: string, expiresAt: string, model: string, voice: string }` |
| `agent-tools` | `{ tool: 'get_nearby_incidents' \| 'get_incident_details' \| 'confirm_incident', arguments: object }` | tool-specific JSON (same shapes as §3.2) |
| `proximity-dispatcher` | trigger-driven on incident insert; **manual SOS:** `{ type: 'sos', location: { lat: number, lng: number } }` | `{ dispatched: number }` |

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
`IDENTITY_VERIFY_API_KEY`, `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WHATSAPP_FROM`,
`WHATSAPP_PROXIMITY_TEMPLATE`, `WHATSAPP_SOS_TEMPLATE`, `MAX_RADIUS_METERS`,
`DEFAULT_RADIUS_METERS`, `INCIDENT_TTL_HOURS`, `CONFIRM_THRESHOLD`, `DISPUTE_THRESHOLD`,
`TRUST_VERIFIED_BONUS`, `TRUST_PER_CONFIRMED`, `TRUST_PER_DISPUTED`, `TIMEZONE`,
`DEFAULT_LANGUAGE`.

---

## 7. Git protocol (disjoint dirs → conflict-free merges)

- Branch per plan: `feat/f2-live-map`, `feat/b2-identity`, …
- Because the two lanes touch disjoint directories, merges to the shared branch never
  conflict. The only files both lanes read are the frozen ones in §1 — settle those at H0.
- Commit convention: Conventional Commits in **English** (personal/SteveSant project).
