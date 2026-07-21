# PRD — Pulso

**Version:** 1.0 · **Date:** 2026-07-20 · **Event:** OpenAI Buildathon (full day)
**Status:** Approved for build

---

## 1. Problem

Urban incidents — road closures, accidents, floods, fires, public events — happen faster
than any official channel can publish them. Citizens already *see* them first, but that
knowledge is trapped: it lives in scattered WhatsApp groups, unverified tweets, and
word of mouth. The result is two failures at once:

- **People can't get a trustworthy, real-time picture of what's happening around them.**
- **Crowd reports are unusable** because anyone can post anything — noise, fakes, and
  duplicates drown the signal.

## 2. Solution

**Pulso** turns citizens into a verified sensor network for the city:

1. A user **reports** an incident with a photo and location. OpenAI vision reads the photo
   and proposes structured fields (category, severity, title, description); the user
   confirms and publishes.
2. The incident appears **instantly on a shared live map** for everyone nearby.
3. Anyone can **ask a voice agent** ("Cerca") *"what's happening around me?"* and get a
   spoken, accurate answer built from real incident data — never hallucinated.
4. Every account is tied to a **validated national ID (cédula)**, so each report carries a
   verified identity and a trust signal. Bad actors can't spin up throwaway accounts.

The differentiator is not "another incident map." It's **verified, real-time, and
conversational** — the map, the AI photo intake, and the voice agent reinforce each other,
and identity verification is what makes the crowd data trustworthy enough to act on.

## 3. Target users

| User | Need |
|---|---|
| **Reporter** (any citizen) | Report what they see in seconds, with credit/trust for doing so |
| **Consumer** (any citizen / commuter) | Know what's happening nearby right now, hands-free while moving |
| **(Future) Authorities / press** | A verified, structured feed of on-the-ground events |

Primary persona for the demo: a commuter in the city who wants to know if their route is
affected and to report a hazard they just passed.

## 4. Scope

### In scope (P0 — must demo)
- Email + password sign-up **with cédula verification** (verified badge on the profile).
- Report flow: capture/upload photo → AI analysis → review structured fields → publish.
- Live map of active incidents, updating in real time for all connected clients.
- Voice agent "Cerca" over WebRTC with two tools: `get_nearby_incidents`,
  `get_incident_details`.

### In scope (P1 — polish, time permitting)
- `confirm_incident` — community **confirm or dispute** (status → `confirmed` / `disputed`, trust bump).
- Incident status lifecycle shown in UI (provisional / confirmed / disputed / resolved).
- 3-tier in-app notifications (bottom sheet / toast / notification center) driven by Realtime ([ADR-016](DECISIONS.md)).
- Post-login permissions & safety onboarding — grant location; microphone optional ([ADR-019](DECISIONS.md)).
- Seed data around the venue; verified-identity badge on incident cards.

### In scope (P2 — stretch)
- "Mobility mode" — a second agent persona prioritizing road/transport incidents.
- **Safety layer — WhatsApp emergency alerts (P1/P2):** opt-in emergency contacts, per-user
  alert rules, `proximity-dispatcher` fan-out via the `MessagingGateway` / Hermes gateway, and
  a manual **SOS** button. An added safety layer, **not a fifth core pillar** ([ADR-017](DECISIONS.md)).
- Near-duplicate detection by proximity + category.

### Out of scope (explicitly not building)
- Native mobile apps (React Native / Capacitor). Pulso ships as a **mobile-first,
  installable PWA** — web only, run in the phone's browser. See [ADR-013](DECISIONS.md).
- Push notifications to a closed app (Web Push / FCM / APNS) — simulated in-app only (3-tier,
  [ADR-016](DECISIONS.md)); reaching a user with the app closed is done via the WhatsApp safety
  layer ([ADR-017](DECISIONS.md)), not push.
- Real Registro Civil integration is *optional* (env-configurable); algorithmic
  validation is the guaranteed path.
- Moderation dashboards, analytics, monetization, multi-city onboarding.

## 5. Functional requirements

**Identity & auth**
- FR-1 A user signs up with email, password, and a 10-digit cédula.
- FR-2 The cédula is validated (external provider if configured, else algorithmic module-10);
  invalid cédulas block sign-up with a clear message.
- FR-3 A cédula may be used for **at most one** account (uniqueness enforced server-side by hash).
- FR-4 The raw cédula is **never stored** — only an HMAC hash — and never exposed to any client.

**Reporting**
- FR-5 A signed-in user can capture or upload a photo and attach their current geolocation.
- FR-6 On upload, `analyze-report` returns a structured suggestion: `category`, `severity`
  (1–5), `title`, `description`.
- FR-7 The user can edit any suggested field before publishing.
- FR-8 Publishing inserts an incident owned by the user (owner id comes from the JWT, not the client).

**Map & realtime**
- FR-9 The map shows active (non-expired) incidents near the user, colored by category/severity.
- FR-10 When any client inserts/updates/deletes an incident, all connected maps update within ~1–2s.
- FR-11 Incidents expire after `INCIDENT_TTL_HOURS` and drop off the active view.

**Voice agent**
- FR-12 The browser gets an **ephemeral** OpenAI client secret from `create-realtime-session`;
  the real API key never reaches the browser.
- FR-13 The agent answers spoken questions by calling tools; it must not invent incidents.
- FR-14 `get_nearby_incidents` returns incidents within a radius using the user's location.
- FR-15 `get_incident_details` returns details for one incident **without** revealing reporter PII.
- FR-16 Tool execution validates all inputs server-side and derives the user from the JWT.

**Notifications & alerts (in-app, via Realtime)**
- FR-17 On a new nearby-incident INSERT received over Supabase Realtime, the client surfaces
  it in one of three tiers: a **bottom sheet** when severity ≥ `NEXT_PUBLIC_ALERT_SEVERITY_MIN`
  **and** distance < `NEXT_PUBLIC_ALERT_RADIUS_METERS`; a **toast** otherwise; and always
  appends it to the **notification center**. See [ADR-016](DECISIONS.md).
- FR-18 The notification center — reached from a bell icon in the map top bar — lists recent
  nearby incidents derived from the incidents query (no separate table for the MVP).
- FR-19 Alert thresholds default from env (FR-17) and can be overridden per user (min severity
  + radius) from the safety settings.

**Community trust**
- FR-20 From the incident-detail sheet a signed-in user can **confirm** or **dispute** an
  incident — one vote per user, either kind (switchable). See [ADR-018](DECISIONS.md).
- FR-21 Enough confirmations move status toward `confirmed`; enough disputes toward `disputed`.
  The `confirm_incident` RPC and the agent tool of the same name take a `kind` argument
  (`confirm` | `dispute`).

**Safety & emergency (WhatsApp / SOS) — P1/P2**
- FR-22 A user can enable the WhatsApp safety layer and register/verify their own phone number
  (`whatsapp_config`). See [ADR-017](DECISIONS.md).
- FR-23 A user can add **emergency contacts** by phone number; adding a contact sends a
  WhatsApp **opt-in** request (reply "SÍ" to accept / "BAJA" to opt out) and the contact's
  status is tracked (`pending` / `accepted` / `declined`). Only **accepted** contacts are ever messaged.
- FR-24 A user can define **alert rules** — a minimum severity and a radius around their
  location — for the WhatsApp safety layer.
- FR-25 On incident INSERT, `proximity-dispatcher` evaluates every user's alert rules
  server-side (PostGIS distance ≤ `radius_meters` **and** severity ≥ `min_severity`) and
  enqueues WhatsApp sends to that user's accepted contacts through the `MessagingGateway` port.
- FR-26 A manual **SOS** button messages the user's accepted emergency contacts immediately
  via the same dispatch path, using an SOS template.

**Onboarding & permissions**
- FR-27 A first-run "Seguridad y WhatsApp" screen (also available under the Perfil tab)
  requests runtime permissions (location required; microphone optional) and lets the user
  enable WhatsApp + register their phone, manage emergency contacts, and set alert rules.
  See [ADR-019](DECISIONS.md).

## 6. Non-functional requirements
- **Security:** the LLM prompt controls conversation only; all authorization/validation
  lives in Edge Functions + Postgres RLS. See [ARCHITECTURE](ARCHITECTURE.md#security-model).
- **Privacy:** no raw cédula stored; reporter identity never spoken or returned by the agent;
  exact coordinates not read aloud. Users' and emergency-contacts' phone numbers are stored
  per-owner under RLS (owner-only), never exposed to other users or the agent, and a contact is
  messaged only after explicit WhatsApp opt-in.
- **Latency:** map update ≤ 2s; agent first audio response ≤ ~2s after a tool result.
- **Config:** no hardcoded URLs/keys/thresholds — everything via env (radius, TTL, models,
  voice, locale, alert thresholds, WhatsApp gateway).
- **Locale:** all user-facing copy in Spanish; timezone `America/Guayaquil`.
- **Mobile-first:** designed for a phone held on the street — full-screen map, large tap
  targets, one-hand reach; installable PWA (`manifest.json`, home-screen icon, standalone
  display). Must be usable on mobile Safari and mobile Chrome.

## 7. Success criteria (what "done" means at judging)
- ✅ A fresh account is created with a validated cédula, live, in under a minute.
- ✅ A photo is analyzed by AI and published; it appears on a **second device's** map automatically.
- ✅ The voice agent answers "¿qué está pasando cerca de mí?" using the seeded + freshly
  reported incidents, and then answers a follow-up about a specific incident.
- ✅ The demo tells one continuous story that visibly exercises all four pillars.
- ✅ No secret leaves the server; the team can articulate the security model in one sentence.

## 8. Risks (see [PLAN](PLAN.md#risks) for mitigations)
- WebRTC / microphone permissions on venue Wi-Fi.
- OpenAI model IDs / rate limits differing from assumptions.
- Geolocation denied in the browser → need a manual location fallback.
- Empty map with no data → **seed is mandatory**, not optional.
