# Pulso

**Real-time citizen urban-information platform.** People report city incidents (road
closures, accidents, floods, fires, public events) with a photo; an AI structures the
report, a live map shares it with everyone nearby, and a voice agent — **"Cerca"** —
answers "what's happening around me?" using real data.

Built for the **OpenAI Buildathon** (full-day event).

> Docs language: technical docs are in English; the demo script and pitch
> ([`docs/DEMO.md`](docs/DEMO.md), [`docs/PITCH.md`](docs/PITCH.md)) are in Spanish.
> The **product UI copy is in Spanish** (target locale: Ecuador).

---

## The four things that make the demo land

1. **Collaborative live map** — incidents appear for everyone in real time (Supabase Realtime).
2. **AI photo analysis** — snap a photo, OpenAI vision fills category / severity / title / description.
3. **Voice agent "Cerca"** — talk to it; it calls tools to fetch real incidents and answers by voice (OpenAI Realtime + WebRTC).
4. **Verified identity** — accounts are tied to a validated national ID (cédula), so reports carry trust, not spam.

Plus an optional **safety layer**: WhatsApp emergency alerts (opt-in contacts + proximity rules)
and a manual SOS — an added layer, **not a fifth pillar**. See [ADR-017](docs/DECISIONS.md).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) · TypeScript · **mobile-first PWA** · `react-map-gl` + **MapLibre GL** · Tailwind |
| Backend | **Supabase** — Auth · Postgres + **PostGIS** · Storage · Realtime · Edge Functions (Deno/TS) |
| AI | OpenAI **Responses API** (vision, structured outputs) · OpenAI **Realtime API** (`gpt-realtime`, WebRTC) |
| Hosting | Vercel (frontend) · Supabase Cloud |

There is **no separate backend server**. Supabase Edge Functions are the backend.

Pulso ships as a **mobile-first, installable PWA** — it runs in the phone's browser
(camera, microphone, geolocation, and OpenAI Realtime WebRTC all work there), with a
`manifest.json` for "Add to Home Screen". No native build, no app install: judges open a
URL on their own phone. See [ADR-013](docs/DECISIONS.md).

## Repository layout

Three file-owned delivery lanes keep the team moving independently: `frontend/` (Next.js),
`backend/` (Supabase + shared hexagon), and `plans/integrations/` (Hermes, deployment, and
demo delivery). Pragmatic hexagonal (ports & adapters): a dependency-free `backend/core/`
is shared by the app (Node) and the Edge Functions (Deno). See
[ARCHITECTURE §8](docs/ARCHITECTURE.md#8-code-architecture--pragmatic-hexagonal-ports--adapters)
and [`plans/CONTRACT.md`](plans/CONTRACT.md) for the frozen frontend↔backend seam.

```
frontend/             # Next.js mobile-first PWA — thin lib/ HTTP clients + UI
backend/
  core/               # pure TS, zero deps — domain, ports, use-cases (shared frontend + edge)
  adapters/           # identity · ai · persistence · messaging (Hermes WhatsApp)
  supabase/
    migrations/       # 0001_init.sql · 0002_whatsapp_sos.sql
    functions/        # verify-identity · analyze-report · create-realtime-session
                      # agent-tools · proximity-dispatcher (thin handlers + composition roots)
docs/                 # PRD · ARCHITECTURE · DATA-MODEL · DECISIONS · PLAN · DEMO · PITCH
plans/                # contract + orchestration + frontend/backend/integrations lanes
```

## Documentation

| Doc | What it is |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements: problem, users, scope, success criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, components, data & event flows, security model |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Schema, PostGIS, RPC functions, RLS policies, seed — with runnable SQL |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture Decision Records (why, not just what) |
| [`docs/PLAN.md`](docs/PLAN.md) | Hour-by-hour build plan, role checklists, cut lines, risks |
| [`docs/DEMO.md`](docs/DEMO.md) | 🇪🇸 Guion de demo paso a paso |
| [`docs/PITCH.md`](docs/PITCH.md) | 🇪🇸 Narrativa para jueces |

**Start here:** read `PRD.md` → `ARCHITECTURE.md` → `PLAN.md`. Then everyone opens their
role checklist in `PLAN.md` and begins.

## Quick setup (event day)

```bash
# 1. Install the npm-workspaces monorepo (backend/core + backend/adapters + frontend)
npm install
npm run typecheck            # core + adapters + frontend
npm run dev                  # Next.js dev server (frontend/)

# 2. Supabase (project created in dashboard; enable PostGIS extension)
npm i -g supabase
supabase login
cd backend
supabase link --project-ref <your-ref>
# migrations live in backend/supabase/migrations/ (0001_init, 0002_whatsapp_sos):
supabase db push

# 3. Edge Functions (five functions live in backend/supabase/functions/*)
supabase functions deploy analyze-report create-realtime-session agent-tools verify-identity proximity-dispatcher
# then wire a DB trigger/webhook on incidents INSERT → proximity-dispatcher (safety layer, P2)

# 4. Set Edge Function secrets (never commit these)
supabase secrets set OPENAI_API_KEY=... CEDULA_HASH_PEPPER=... ...
```

## Environment variables

Nothing is hardcoded — `.env.example` (root) is the canonical template; copy the
`NEXT_PUBLIC_*` block into `frontend/.env.local` and set the server-side secrets in
Supabase. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#configuration) for the full table.

```bash
# --- Frontend (frontend/.env.local, exposed to browser) ---
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_MAP_STYLE_URL=https://demotiles.maplibre.org/style.json   # swap for a Carto/OSM style
NEXT_PUBLIC_DEFAULT_LAT=-1.05458         # venue: PUCE Manabí, Portoviejo (matches seed.sql)
NEXT_PUBLIC_DEFAULT_LNG=-80.45445
NEXT_PUBLIC_DEFAULT_ZOOM=14
NEXT_PUBLIC_DEFAULT_RADIUS_METERS=3000
NEXT_PUBLIC_ALERT_SEVERITY_MIN=4         # min severity for a bottom-sheet alert
NEXT_PUBLIC_ALERT_RADIUS_METERS=500      # max distance (m) for a bottom-sheet alert
NEXT_PUBLIC_VENUE_NAME="Cdla. Primero de Mayo"   # map-header sector label
NEXT_PUBLIC_VENUE_CITY=Portoviejo                # map-header city label
NEXT_PUBLIC_OPENAI_REALTIME_URL=https://api.openai.com/v1/realtime/calls   # WebRTC SDP endpoint

# --- Supabase Edge Function secrets (server-side only) ---
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1  # optional override for the OpenAI REST base
OPENAI_REALTIME_MODEL=gpt-realtime       # confirm against your OpenAI access
OPENAI_VISION_MODEL=gpt-5.6-terra        # Build Week lineup: sol=frontier / terra=balanced / luna=cheap
OPENAI_REALTIME_VOICE=marin
CEDULA_HASH_PEPPER=<random-long-secret>  # HMAC pepper for cedula hashing
IDENTITY_VERIFY_API_URL=                 # optional external cédula provider; empty = algorithmic fallback
IDENTITY_VERIFY_API_KEY=                 # optional
MAX_RADIUS_METERS=10000                  # hard cap on the voice agent's nearby queries
DEFAULT_RADIUS_METERS=3000
INCIDENT_TTL_HOURS=24
CONFIRM_THRESHOLD=3                      # confirmations → 'confirmed' (confirm_incident RPC)
DISPUTE_THRESHOLD=3                      # disputes → 'disputed' (confirm_incident RPC)
TRUST_VERIFIED_BONUS=10                  # trust-score weights (helper not wired yet)
TRUST_PER_CONFIRMED=2
TRUST_PER_DISPUTED=3
HERMES_WEBHOOK_URL=                      # (P2 safety layer) Hermes pulso-alerts webhook URL
HERMES_WEBHOOK_SECRET=                   # (P2) HMAC V2 secret shared with Hermes
PROXIMITY_WEBHOOK_SECRET=                # (P2) database-webhook guard for proximity-dispatcher
TIMEZONE=America/Guayaquil
DEFAULT_LANGUAGE=es
```

> ⚠️ Model IDs (`gpt-realtime`, `gpt-5.6-terra`) come from the Build Week brief — confirm
> the exact IDs available in the OpenAI account provided at the Buildathon.
