# Architecture — Pulso

**Version:** 1.0 · **Date:** 2026-07-20

This document describes the system design, the components and their responsibilities, the
data and event flows, and the security model. For the schema/SQL see
[DATA-MODEL.md](DATA-MODEL.md); for the rationale behind each choice see
[DECISIONS.md](DECISIONS.md).

---

## 1. High-level architecture

```
┌───────────────────────────────────────────────┐
│              Frontend — Next.js                │
│                                                │
│   Map (MapLibre) · Camera · Microphone · Auth  │
└───────┬───────────────────────────┬────────────┘
        │                           │
        │ Supabase JS               │ WebRTC (audio + data channel)
        │ (auth, query, realtime)   │
        ▼                           ▼
┌────────────────────┐     ┌────────────────────────┐
│      Supabase       │     │    OpenAI Realtime      │
│                     │     │    (voice agent)        │
│  Auth (JWT)         │     └───────────┬─────────────┘
│  Postgres + PostGIS │                 │ "call tool get_nearby_incidents"
│  Storage (photos)   │                 │ (function_call event)
│  Realtime (map)     │                 ▼
│  Edge Functions ────┼──────── browser bridges the tool call
│    • verify-identity │                 │
│    • analyze-report  │◄────────────────┘  invoke agent-tools
│    • create-realtime-session
│    • agent-tools     │────► Postgres RPC ────► PostGIS
│    • proximity-dispatcher ──► Hermes (WhatsApp, outbound)
└─────────┬───────────┘
          │ calls OpenAI (server-side, with real API key)
          ▼
┌────────────────────┐
│   OpenAI APIs       │
│  Responses (vision) │
│  Realtime (secrets) │
└────────────────────┘
```

**Two independent "realtime" systems — don't conflate them:**
- **Supabase Realtime** pushes incident inserts/updates to every connected map.
- **OpenAI Realtime** is the low-latency voice conversation with the agent.

Separately, a DB trigger on `incidents` INSERT invokes **`proximity-dispatcher`**, which sends
WhatsApp via the **Hermes** gateway (outbound only) — the optional safety layer, see
[ADR-017](DECISIONS.md).

## 2. Components & responsibilities

### 2.1 Frontend (Next.js) — mobile-first PWA
Built mobile-first and shipped as an **installable PWA** (`manifest.json` +
`display: standalone` + home-screen icon; an optional service worker via `next-pwa` for
the app-shell). It runs entirely in the phone's browser, using web platform APIs directly:
`getUserMedia` (camera + mic), `navigator.geolocation`, and WebRTC for the OpenAI Realtime
session. No native modules, no app install — see [ADR-013](DECISIONS.md).

Three screens under the App Router:

| Route | Responsibility |
|---|---|
| `/` → map | Render MapLibre, load nearby incidents, subscribe to Realtime, show incident cards; **bell icon → notification center**; fire 3-tier alerts on nearby INSERTs |
| `/report` | Camera/upload, geolocation, call `analyze-report`, review & publish |
| `/assistant` | Establish WebRTC session, mic UI, **bridge tool calls** to `agent-tools` |
| `/notifications` | Notification center — recent nearby incidents, derived from the incidents query (no separate table) |
| `/auth` | Sign-up (email + password + cédula) and sign-in — no tab bar (pre-login) |
| `/profile` | Verified profile + config: search radius, categories, agent mode (general / mobility), alert rules, location privacy, sign out |
| `/profile/security` → "Seguridad y WhatsApp" | First-run + Perfil: grant permissions (location; mic optional), enable WhatsApp + register phone, manage emergency contacts, set alert rules ([ADR-019](DECISIONS.md)) |

A persistent **bottom tab bar** — **Mapa · Reportar** (accent circle) **· Cerca · Perfil** — is
the primary navigation across all post-login screens; auth screens have no tab bar. Settings and
the "Seguridad y WhatsApp" screen live behind the Perfil tab; the notification center is reached
from the bell icon in the map top bar.

Key client modules:
```
lib/
  supabase.ts          # browser Supabase client (anon key)
  realtime-agent.ts    # WebRTC session setup, data-channel handlers
  realtime-tools.ts    # tool contracts (JSON schema) shared with the session
  incidents.ts         # queries + realtime subscription
components/
  IncidentMap.tsx
  ReportForm.tsx
  RealtimeAssistant.tsx
  AuthForm.tsx
```

### 2.2 Supabase (the entire backend)
- **Auth** — email/password. Issues the JWT that every Edge Function and RLS policy trusts.
- **Postgres + PostGIS** — `profiles`, `incidents`, `incident_confirmations` (with a
  confirm/dispute `kind`); plus the safety-layer tables `whatsapp_config`, `emergency_contacts`,
  `alert_rules`, `whatsapp_dispatch_log` (migration `0002`); geospatial queries via RPC.
- **Storage** — bucket `report-photos` for uploaded images.
- **Realtime** — Postgres Changes on `incidents` broadcast to subscribed clients.
- **Edge Functions** — the serverless backend (Deno/TypeScript). Five functions:

| Function | Auth? | Job |
|---|---|---|
| `verify-identity` | user JWT | Validate cédula (external provider → algorithmic fallback), create/patch `profiles`, store `cedula_hash` |
| `analyze-report` | user JWT | Fetch photo, call OpenAI Responses (vision + structured output), return fields |
| `create-realtime-session` | user JWT | Build persona/instructions + tools, mint ephemeral OpenAI client secret |
| `agent-tools` | user JWT | Router (`switch`) executing each agent tool against Postgres RPC |
| `proximity-dispatcher` | service role (trigger/webhook) | On incident INSERT, match users' `alert_rules` (PostGIS + severity), enqueue WhatsApp to accepted contacts via `MessagingGateway`; also the target of the manual SOS ([ADR-017](DECISIONS.md)) |

### 2.3 OpenAI
- **Responses API** — vision + **structured outputs** (JSON schema) for report analysis.
- **Realtime API** (`gpt-realtime`) — the voice agent. The browser connects **directly**
  over WebRTC using an ephemeral client secret; audio never passes through our servers.

### 2.4 Messaging — WhatsApp via Hermes (optional safety layer)
The `proximity-dispatcher` function sends outbound WhatsApp through the **`MessagingGateway`**
port; the concrete adapter is **`HermesWhatsAppGateway`** (env `HERMES_API_URL`,
`HERMES_API_KEY`, `HERMES_WHATSAPP_FROM`). This is the only channel that reaches a user with
the app closed, and it is a P1/P2 layer — **not a core pillar** ([ADR-017](DECISIONS.md)).

## 3. Core flows

### 3.1 Sign-up with verified identity
```
User submits email + password + cédula
        ↓
Supabase Auth creates the user (JWT issued)
        ↓
Frontend calls verify-identity (with JWT + cédula)
        ↓
verify-identity:
  1. if IDENTITY_VERIFY_API_URL set → call external provider
     else / on error → algorithmic module-10 validation
  2. compute cedula_hash = HMAC(pepper, cedula)
  3. upsert profiles row: { id: auth.uid(), cedula_hash (UNIQUE), verified, verification_method }
        ↓
On UNIQUE violation → "this ID already has an account"
On invalid cédula   → block, ask to re-enter
```
The raw cédula lives only in the request body and in memory during validation. Only the
hash is persisted.

### 3.2 Report an incident (AI photo analysis)
```
User takes/uploads photo + grants geolocation
        ↓
Frontend uploads image to Storage (report-photos/<uid>/<uuid>.jpg)
        ↓
Frontend calls analyze-report { photo_path }
        ↓
analyze-report → OpenAI Responses (vision, structured output schema)
        ↓
Returns { category, severity, title, description }
        ↓
User reviews/edits → Publish
        ↓
INSERT into incidents (reporter_id = auth.uid(), location = geography(point), photo_path)
        ↓
Supabase Realtime broadcasts the INSERT → every map refreshes
```

### 3.3 Voice agent with tools
```
Frontend calls create-realtime-session (JWT)
        ↓
Edge Function POSTs to OpenAI /v1/realtime/client_secrets with the real API key,
   including instructions (persona), tools (contracts), voice, VAD
        ↓
Returns ephemeral client secret
        ↓
Browser opens WebRTC connection to OpenAI (audio + data channel)
        ↓
User: "¿Qué está pasando cerca de mí?"
        ↓
OpenAI emits response.function_call_arguments.done { name, arguments, call_id }
        ↓
Browser bridge invokes Supabase agent-tools { tool, arguments }
        ↓
agent-tools → Postgres RPC → PostGIS → JSON result
        ↓
Browser sends conversation.item.create { function_call_output, call_id, output }
   then response.create
        ↓
OpenAI speaks the answer using the tool result
```

The **browser is the bridge**: OpenAI never calls Supabase directly. The tool *contract*
(what the model sees) and the tool *implementation* (`agent-tools`) are separate things
wired together by the frontend. The user's location is provided to the tool by the
frontend (from `navigator.geolocation`), not invented by the model.

### 3.4 Live map updates
```ts
const channel = supabase
  .channel("incidents-map")
  .on("postgres_changes",
    { event: "*", schema: "public", table: "incidents" },
    () => refreshVisibleIncidents())
  .subscribe();
```
Postgres Changes is the fastest path for an MVP. (Broadcast-with-triggers is the
production-scale option — noted in [DECISIONS.md](DECISIONS.md), out of scope today.)

### 3.5 In-app notifications (3-tier) and confirm/dispute
The same Realtime subscription that refreshes the map also drives notifications —
**client-side, no new backend** ([ADR-016](DECISIONS.md)):
```
incident INSERT arrives on the Realtime channel
        ↓
client computes distance (navigator.geolocation) + reads severity
        ↓
severity ≥ NEXT_PUBLIC_ALERT_SEVERITY_MIN AND distance < NEXT_PUBLIC_ALERT_RADIUS_METERS ?
   yes → bottom sheet          no → toast
        ↓ (always)
append to the notification center (bell icon in the map top bar)
```
Thresholds default from env and are overridable per user in the safety settings.

From the incident-detail sheet a user can **confirm** or **dispute** ([ADR-018](DECISIONS.md)):
```
user taps Confirm / Dispute
        ↓
agent-tools / client → RPC confirm_incident(target_id, kind)
        ↓
upsert incident_confirmations (one row per user; kind switchable)
        ↓
recount: confirms → toward 'confirmed', disputes → toward 'disputed'
        ↓
incidents row updates → Realtime broadcasts → every map + detail sheet refreshes
```

### 3.6 Proximity WhatsApp alerts & SOS (optional safety layer)
```
incident INSERT
        ↓
DB trigger/webhook invokes proximity-dispatcher (service role)
        ↓
RPC get_alert_matches(incident_id):
   alert_rules (enabled, severity ≥ min_severity, st_dwithin(location, center, radius_meters))
   ⨝ whatsapp_config (enabled) ⨝ emergency_contacts (opt_in_status = 'accepted')
        ↓
for each match → MessagingGateway.sendWhatsApp({ to, template, params })  (Hermes)
        ↓
record in whatsapp_dispatch_log (unique per incident+contact → idempotent)

Manual SOS: client → proximity-dispatcher with an SOS template → same fan-out to my contacts.
```
Adding a contact first sends a WhatsApp **opt-in** ("responde SÍ" / "BAJA"); only `accepted`
contacts are ever messaged. See [ADR-017](DECISIONS.md) and [DATA-MODEL §9](DATA-MODEL.md#9-whatsapp--sos-migration-0002).

## 4. Agent design (persona & prompt)

Instructions are **layered**, built server-side in `create-realtime-session`:
`identity → objective → personality → tool-usage rules → status semantics → privacy →
dynamic context → response format`. The persona is chosen by a validated `persona_id` from
the client (never a raw prompt), so users can't rewrite the agent's rules.

- Default persona: **"Cerca"** — calm, brief, practical, Spanish, voice-first.
- Stretch persona: **"Ruta"** — mobility-focused (closures, accidents, transport).

Personas are TypeScript constants for the hackathon (fast, fewer failure points), not a
DB table. Location is injected as a context message (`conversation.item.create` — not
`session.update`, which would overwrite the server-set persona instructions); the exact
coordinates are not read aloud.

## 5. Security model

Four layers, each with one job — **the prompt is the weakest and does the least**:

| Layer | Enforces |
|---|---|
| **System prompt / instructions** | Conversational behavior only ("don't invent incidents") — *not a security boundary* |
| **Tool description** | Helps the model decide *when* to call a tool |
| **Edge Function** | Validates inputs, derives `user_id` from the JWT, checks permissions before acting |
| **Postgres RLS** | Final authority on what rows a user may read/write |

Concretely:
- The OpenAI API key exists **only** in Edge Function secrets. The browser gets an
  ephemeral client secret.
- `agent-tools` never trusts a `user_id` in the arguments — it calls `supabase.auth.getUser()`.
- Any state-changing tool (`confirm_incident`, future `mark_resolved`) re-checks ownership/role.
- RLS: a user reads only their own `profiles` row; incidents are readable by authenticated
  users but writable only with `reporter_id = auth.uid()`.
- Storage: authenticated upload to own prefix; reads via public bucket or signed URLs
  (⚠️ photos may contain plates/faces — acceptable for the demo, flagged as a real-world concern).
- Safety layer: `whatsapp_config`, `emergency_contacts`, and `alert_rules` are **owner-only**
  under RLS — no user (or the agent) can read another's contacts or phone numbers. A contact is
  messaged only after explicit WhatsApp **opt-in** (`opt_in_status = 'accepted'`).
  `proximity-dispatcher` runs with the **service role** (bypasses RLS, like seed) precisely
  because it must fan out across many users' rules on a single INSERT.

## 6. Configuration

Nothing hardcoded. All tunables are environment variables.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | frontend | Supabase client |
| `NEXT_PUBLIC_MAP_STYLE_URL` | frontend | MapLibre style/tiles URL |
| `NEXT_PUBLIC_DEFAULT_LAT/LNG/ZOOM` | frontend | Initial map view (set to venue) |
| `NEXT_PUBLIC_DEFAULT_RADIUS_METERS` | frontend | Default search radius |
| `NEXT_PUBLIC_ALERT_SEVERITY_MIN` | frontend | Min severity for a bottom-sheet alert (default 4) |
| `NEXT_PUBLIC_ALERT_RADIUS_METERS` | frontend | Max distance for a bottom-sheet alert (default 500) |
| `NEXT_PUBLIC_VENUE_NAME` / `_VENUE_CITY` | frontend | Map-header sector + city labels |
| `NEXT_PUBLIC_OPENAI_REALTIME_URL` | frontend | OpenAI Realtime WebRTC SDP endpoint |
| `OPENAI_API_KEY` | Edge secret | Server-side OpenAI auth |
| `OPENAI_BASE_URL` | Edge secret | Optional override for the OpenAI REST base |
| `OPENAI_REALTIME_MODEL` | Edge secret | Realtime model id (e.g. `gpt-realtime`) |
| `OPENAI_VISION_MODEL` | Edge secret | Vision model id for analysis (default `gpt-5.6-terra`) |
| `OPENAI_REALTIME_VOICE` | Edge secret | Agent voice (e.g. `marin`) |
| `CEDULA_HASH_PEPPER` | Edge secret | HMAC pepper for cédula hashing |
| `IDENTITY_VERIFY_API_URL` / `_API_KEY` | Edge secret | Optional external cédula provider |
| `MAX_RADIUS_METERS` / `DEFAULT_RADIUS_METERS` | Edge secret | Query bounds (cap + default for agent-tools) |
| `INCIDENT_TTL_HOURS` | Edge secret | Incident expiry (adapter `create()` path; DB default 24h) |
| `CONFIRM_THRESHOLD` / `DISPUTE_THRESHOLD` | Edge secret | Votes needed to flip status (passed to `confirm_incident`) |
| `TRUST_VERIFIED_BONUS` / `TRUST_PER_CONFIRMED` / `TRUST_PER_DISPUTED` | Edge secret | Trust-score weights (helper not wired yet) |
| `HERMES_API_URL` / `_API_KEY` | Edge secret | WhatsApp gateway (Hermes) endpoint + key — safety layer |
| `HERMES_WHATSAPP_FROM` | Edge secret | WhatsApp sender number/id for outbound sends |
| `WHATSAPP_PROXIMITY_TEMPLATE` / `WHATSAPP_SOS_TEMPLATE` | Edge secret | Hermes template names |
| `TIMEZONE` / `DEFAULT_LANGUAGE` | Edge secret | Locale (`America/Guayaquil`, `es`) |

## 7. Deployment
- **Frontend:** Vercel (connect the repo, set `NEXT_PUBLIC_*` env, deploy).
- **Backend:** Supabase Cloud — apply migrations (`0001_init`, `0002_whatsapp_sos`), deploy the
  five Edge Functions, set secrets. For the safety layer, wire the DB trigger/webhook on
  `incidents` INSERT → `proximity-dispatcher` and set the `HERMES_*` secrets.
- **Demo devices:** at least two (phone + laptop) to show the collaborative live map.

## 8. Code architecture — pragmatic hexagonal (ports & adapters)

Business logic depends on **interfaces (ports)**, never on OpenAI, Supabase, or HTTP.
Concrete tech lives in **adapters** wired in at each Edge Function's *composition root*.
Applied only at the five seams that actually flex (the four original seams plus the
`MessagingGateway` added for the safety layer, [ADR-017](DECISIONS.md)); everything else stays
thin (YAGNI). See [ADR-014](DECISIONS.md).

```
backend/                     # everything server-side (npm workspaces: backend/core, backend/adapters)
  core/                      # pure TS, ZERO deps — shared by frontend + edge functions
    domain/     incident.ts · validate-cedula.ts (module-10) · compute-trust-score.ts
                next-incident-status.ts · clamp-severity.ts · …      (pure fns + invariants)
    ports/      identity-verifier.ts · incident-analyzer.ts · incident-repository.ts
                profile-repository.ts · agent-session-factory.ts · messaging-gateway.ts
    use-cases/  verify-identity.ts · analyze-report.ts · get-nearby-incidents.ts
                get-incident-details.ts · confirm-incident.ts · create-agent-session.ts
                dispatch-proximity-alerts.ts (proximity + SOS entry points)
    index.ts    # barrel re-exports
  adapters/
    identity/    algorithmic-verifier.ts · registry-api-verifier.ts · composite-verifier.ts
    ai/          openai-vision-analyzer.ts · fake-analyzer.ts · openai-realtime-session-factory.ts
    persistence/ supabase-incident-repository.ts · supabase-profile-repository.ts
    messaging/   hermes-whatsapp-gateway.ts
  supabase/functions/  # HTTP adapters (thin handlers) + composition roots
frontend/            # Next.js PWA — thin lib/ HTTP clients + UI (no hexagon inside React)
```

### Dependency rule
```
frontend (UI) ─┐
edge handlers ─┼─► use-cases ─► ports ◄─ adapters ─► OpenAI / Supabase / HTTP
               │        └─────► domain (pure)
     (composition roots inject adapters into use-cases; every arrow points inward)
```

### The five ports (seams)
| Port | Key methods | Adapters |
|---|---|---|
| `IdentityVerifier` | `verify(cedula) → {valid, method, reason?}` | `RegistryApiVerifier`, `AlgorithmicVerifier`, `CompositeVerifier` (registry → fallback) |
| `IncidentAnalyzer` | `analyze({image}) → {category, severity, title, description}` | `OpenAIVisionAnalyzer`, `FakeAnalyzer` (local dev, no OpenAI calls) |
| `IncidentRepository` / `ProfileRepository` | `findNearby` · `getDetails` · `create` · `confirm(id, kind)` / `createVerified` | `SupabaseIncidentRepository`, `SupabaseProfileRepository` |
| `AgentSessionFactory` | `createSession({personaId, context}) → clientSecret` | `OpenAIRealtimeSessionFactory` |
| `MessagingGateway` | `sendWhatsApp({ to, template, params })` | `HermesWhatsAppGateway` |

The domain (`core/domain`) is pure: `validateCedula` (module-10), incident invariants,
status transitions, trust scoring — no I/O, so it stays pure and easy to reason about.

### Composition root (thin handler)
```ts
// backend/supabase/functions/analyze-report/index.ts
Deno.serve(async (req) => {
  const userId = await userFromJwt(req);                                    // authorize
  const analyzer = new OpenAIVisionAnalyzer(env.OPENAI_API_KEY, env.OPENAI_VISION_MODEL);
  const analyzeReport = makeAnalyzeReport({ analyzer });                    // inject adapter
  const { photoPath } = await req.json();
  return Response.json(await analyzeReport({ photoPath, userId }));         // run use-case
});
```

### Identity fallback as composition (not a buried `if`)
```ts
class CompositeVerifier implements IdentityVerifier {
  constructor(private primary: IdentityVerifier, private fallback: IdentityVerifier) {}
  async verify(cedula: string) {
    try { return await this.primary.verify(cedula); }
    catch { return this.fallback.verify(cedula); }   // wired only if IDENTITY_VERIFY_API_URL set
  }
}
```
The raw cédula flows **into** `SupabaseProfileRepository.createVerified` (which hashes it
with the pepper) and never comes back out — no separate hashing port needed.

### Shared `core/` across Node + Deno
`core/` is **dependency-free TypeScript**, imported by both the Next.js app (Node) and the
Edge Functions (Deno). Adapters needing `supabase-js` receive an **injected client**, so
the same repository runs in both runtimes.

### SOLID mapping
**SRP** one use-case/adapter per file · **OCP** new provider = new adapter, use-cases
untouched · **LSP** adapters interchangeable behind a port · **ISP** small focused ports ·
**DIP** use-cases depend on ports, adapters injected at the edge.

### YAGNI boundaries (deliberately NOT doing)
No value objects everywhere, no DTO/mapper layer beyond what's needed, no generic
repository, no CQRS/event sourcing, and **no hexagon inside React** — the UI keeps a thin
`lib/` of HTTP clients to the Edge Functions.
