# Architecture Decision Records — Pulso

Short records of the choices that shape the build, and why. Each is a decision we can
point a judge to. Format: **Context → Decision → Consequences**.

---

## ADR-001 — Supabase is the entire backend (no separate API server)
**Context:** 1-day build; we need auth, a geo database, file storage, realtime, and a
place to call OpenAI from. Standing up Express/FastAPI/Nest adds deploy surface and time.
**Decision:** Use Supabase for Auth + Postgres/PostGIS + Storage + Realtime, and **Edge
Functions** (Deno/TS) as the serverless backend for all custom logic and OpenAI calls.
**Consequences:** One platform, one deploy story, RLS for free. Edge Functions are meant
for short server-side calls — a perfect fit for validations, queries, and tool execution.
Long-lived connections (the voice stream) deliberately do **not** run here (see ADR-004).

## ADR-002 — Two distinct realtime systems, kept separate
**Context:** "Realtime" is overloaded. The map needs live data sync; the agent needs live
voice.
**Decision:** **Supabase Realtime** (Postgres Changes) for the map; **OpenAI Realtime**
(WebRTC) for voice. They never touch.
**Consequences:** Clear mental model, independent failure domains. A map bug can't break
voice and vice versa.

## ADR-003 — Browser bridges the agent's tool calls (OpenAI ⇄ Supabase)
**Context:** OpenAI Realtime can request a tool, but it doesn't call our database.
**Decision:** The frontend listens for `response.function_call_arguments.done`, invokes the
`agent-tools` Edge Function, and returns a `function_call_output`, then `response.create`.
**Consequences:** The tool *contract* (what the model sees) and *implementation* (Edge
Function) stay decoupled. The browser also supplies the user's real geolocation, so the
model never guesses coordinates.

## ADR-004 — Ephemeral client secrets; API key stays server-side
**Context:** WebRTC audio should go browser↔OpenAI directly for latency, but we can't ship
the API key to the browser.
**Decision:** `create-realtime-session` uses the real `OPENAI_API_KEY` to mint an
**ephemeral client secret**; the browser opens the WebRTC session with that.
**Consequences:** Audio is low-latency and direct; the long-lived secret never leaves the
server. Sessions are short-lived by design.

## ADR-005 — Single `agent-tools` router, not one function per tool
**Context:** Each tool could be its own Edge Function, but that multiplies deploys, CORS,
and auth setup.
**Decision:** One `agent-tools` function with a `switch` on `tool`, delegating to
per-tool modules.
**Consequences:** One URL, centralized auth/logging, faster to build. Accepted downside:
it can grow large and a bug is broader in blast radius — fine for a 1-day MVP, splittable
later.

## ADR-006 — Realtime via Postgres Changes (not Broadcast) for the MVP
**Context:** Supabase offers Postgres Changes (simple) and Broadcast-with-triggers
(scalable, finer access control).
**Decision:** Use **Postgres Changes** on `incidents`.
**Consequences:** Least code, instant live map. At real scale we'd migrate to Broadcast;
documented as future work, not built today.

## ADR-007 — Verified identity via cédula: external provider with algorithmic fallback
**Context:** We want reports tied to a real person to fight spam/fakes, but we won't have
guaranteed access to an official Registro Civil API at the event.
**Decision:** `verify-identity` **tries** an external provider when
`IDENTITY_VERIFY_API_URL` is configured; otherwise (or on failure) it falls back to
**algorithmic module-10 validation** of the Ecuadorian cédula (province code + third digit
+ check digit). Record which method was used in `verification_method`.
**Consequences:** Works offline and demos reliably, while being ready to plug in real
verification. The validator is swappable per country.

## ADR-008 — Store only an HMAC hash of the cédula, never the raw number
**Context:** A national ID is sensitive PII; we still need one-account-per-person.
**Decision:** Persist `cedula_hash = HMAC(CEDULA_HASH_PEPPER, cedula)` with a UNIQUE
constraint. Never store or return the raw value.
**Consequences:** Uniqueness without holding the raw PII; the number is never exposed to
any client or the agent. Strong, quotable privacy story.

## ADR-009 — Security lives in the backend, not the prompt
**Context:** It's tempting to "tell the model" what it may not do.
**Decision:** The prompt governs conversation only. Every permission, limit, and
validation is enforced in Edge Functions and Postgres RLS. `user_id` always comes from the
JWT, never from tool arguments.
**Consequences:** The agent can't be jailbroken into unauthorized actions; the model being
wrong is a UX bug, not a breach.

## ADR-010 — Personas as TypeScript constants (not a DB table) for the hackathon
**Context:** Personas could be admin-editable rows in Postgres.
**Decision:** Keep persona instructions as TS constants in `create-realtime-session`.
**Consequences:** Fastest path, fewer failure points, no extra query on the hot path.
DB-backed personas are a clean post-hackathon upgrade.

## ADR-011 — MapLibre GL over Mapbox/Google
**Context:** We need a map fast, with zero billing/token friction on event Wi-Fi.
**Decision:** **MapLibre GL** via `react-map-gl`, with a free style/tiles URL from env.
**Consequences:** No API key to provision, open source, swappable style. Slightly less
polished defaults than Mapbox — acceptable, and styleable.

## ADR-012 — Email + password auth (not anonymous / magic link)
**Context:** We need a real "create account" flow that carries the cédula and a durable
identity.
**Decision:** Supabase email/password, with the cédula captured at sign-up.
**Consequences:** Matches the verified-identity story; no email round-trip friction during
the demo (unlike magic link); a real credential exists for each verified person.

## ADR-013 — Mobile-first PWA (web), not React Native
**Context:** Pulso is used on the street — camera, microphone, geolocation — so it must be
a phone experience. The question is *how* to ship mobile in a 1-day build.
**Decision:** Ship a **mobile-first, installable PWA** built with Next.js/React, running in
the phone's browser (Add to Home Screen via `manifest.json`). Not React Native.
**Consequences:** `getUserMedia`, `navigator.geolocation`, and **OpenAI Realtime over
WebRTC** all work natively in mobile browsers, and MapLibre GL runs directly — so we avoid
React Native's native-module cost (`react-native-webrtc` and MapLibre native both need a
dev client / EAS build, plus device provisioning) that would swallow the day. Judges test
it from a URL on their own phone; no install required. If app-store presence is ever
needed, the same web app wraps in Capacitor without a rewrite. Trade-off accepted: no
true-native feel and no background push (simulated in-app), both out of scope today.

## ADR-014 — Pragmatic hexagonal (ports & adapters), not full hexagonal
**Context:** We want clean code / SOLID / ports & adapters, but it's a 1-day build; full
hexagonal ceremony (value objects everywhere, per-layer DTOs/mappers, a hexagon inside the
UI) would cost the demo.
**Decision:** Apply ports & adapters **only at the four seams that genuinely flex** —
identity verification, AI (vision + realtime session), persistence, agent tools — with a
pure, dependency-free domain in a shared `core/`. Handlers and the React UI stay thin;
adapters are injected at each Edge Function's composition root. See
[ARCHITECTURE §8](ARCHITECTURE.md).
**Consequences:** DIP/OCP where it pays off — swap identity providers (external ↔
algorithmic) via a `CompositeVerifier`, run locally with a `FakeAnalyzer` without spending
OpenAI calls, and let the three tracks build in parallel against shared port interfaces
agreed at H0 — with no boilerplate where it doesn't help. Constraint: `core/` must stay
dependency-free so both Node (Next) and Deno (Edge Functions) can import it; adapters
receive injected clients. *(Extended by [ADR-017](#adr-017--whatsapp-emergency-alerts-messaginggateway-port--hermes-adapter--proximity-dispatcher),
which adds a fifth seam, `MessagingGateway`, for the WhatsApp safety layer.)*

## ADR-015 — No automated tests for the hackathon (deliberate)
**Context:** The global engineering rules push TDD + 80% coverage, but this is a time-boxed
1-day build and the team chose to spend that time on the demo path.
**Decision:** Skip automated tests. Rely on TypeScript types, validation at the boundaries
(structured-output + tool-input checks), and **manual verification of the demo path** at the
integration gates (see [PLAN](PLAN.md)).
**Consequences:** Faster to build; the risk is that regressions go uncaught. Mitigated by
the thin, swappable seams (a broken adapter is isolated behind its port) and by rehearsing
the full demo on real devices at H5. Post-hackathon, the pure domain + use-cases are the
natural first place to add tests.

## ADR-016 — In-app notifications, 3-tier, via Supabase Realtime (no web push)
**Context:** We want to alert a user when something relevant happens nearby, but push to a
closed app (Web Push / FCM / APNS) is out of scope (see [ADR-013](#adr-013--mobile-first-pwa-web-not-react-native))
and would add provisioning cost we can't afford in a day.
**Decision:** Drive notifications **client-side** off the map's existing Supabase Realtime
subscription. On a new nearby-incident INSERT, surface one of three tiers: a **bottom sheet**
when severity ≥ `NEXT_PUBLIC_ALERT_SEVERITY_MIN` **and** distance < `NEXT_PUBLIC_ALERT_RADIUS_METERS`;
a **toast** otherwise; and always append it to a **notification center** (bell icon in the
map top bar), whose list is derived from the nearby-incidents query — **no separate table**
for the MVP. Thresholds default from env and can be overridden per user in the safety settings.
**Consequences:** Zero new backend surface, consistent with ADR-013's "simulated in-app"
stance. Because it rides Postgres Changes it fires only while the app is open — acceptable
for the demo and the honest limitation we state; the WhatsApp layer ([ADR-017](#adr-017--whatsapp-emergency-alerts-messaginggateway-port--hermes-adapter--proximity-dispatcher))
is what reaches a user with the app closed.

## ADR-017 — WhatsApp emergency alerts: `MessagingGateway` port + Hermes adapter + `proximity-dispatcher`
**Context:** The 3-tier in-app alerts ([ADR-016](#adr-016--in-app-notifications-3-tier-via-supabase-realtime-no-web-push))
only reach a user with the app open. For a personal-safety layer we want a message that
lands even when nobody is looking at Pulso, plus a way to alert others on your behalf.
**Decision:** Add a **fifth seam** to the four in [ADR-014](#adr-014--pragmatic-hexagonal-ports--adapters-not-full-hexagonal):
a **`MessagingGateway`** port (`sendWhatsApp({ to, template, params })`) with a
**`HermesWhatsAppGateway`** adapter (env: `HERMES_API_URL`, `HERMES_API_KEY`,
`HERMES_WHATSAPP_FROM`). A new Edge Function **`proximity-dispatcher`** runs on incident
INSERT (via DB trigger/webhook), evaluates every user's `alert_rules` (PostGIS distance ≤
`radius_meters` **and** severity ≥ `min_severity`) and enqueues WhatsApp sends to that user's
**accepted** `emergency_contacts` through the port. A manual **SOS** button calls the same
dispatch path with an SOS template. Adding a contact triggers a WhatsApp **opt-in** ("responde
SÍ" to accept / "BAJA" to opt out); status is tracked (`pending`/`accepted`/`declined`) and
only accepted contacts are ever messaged. New tables land in migration `0002_whatsapp_sos.sql`
(see [DATA-MODEL §9](DATA-MODEL.md#9-whatsapp--sos-migration-0002)).
**Consequences:** Reuses the ports & adapters pattern — the gateway is swappable behind
`MessagingGateway` (only `HermesWhatsAppGateway` is implemented; a logging fake for local
dev remains an option) and the dispatcher owns the fan-out so
the client never holds contact logic. This is framed as an **additional safety layer (P1/P2)**,
**not a fifth core pillar** — it's the first thing cut if the core is at risk. Personal-safety
messaging carries real consent/abuse concerns; the opt-in flow is the minimum guard and is
flagged for hardening beyond the hackathon.

## ADR-018 — Confirm **and** dispute as one community-trust signal (`kind` on `incident_confirmations`)
**Context:** P1 already had `confirm_incident` to push a report toward `confirmed`. Trust is
two-sided: the crowd should also be able to say "this isn't real / no longer true".
**Decision:** Model both votes on the existing table by adding a
`kind text not null default 'confirm' check (kind in ('confirm','dispute'))` column, keeping
`unique(incident_id, user_id)` so each user gets **one** vote of either kind (switchable).
The `confirm_incident` RPC and the agent tool of the same name take a `kind` argument: enough
confirms flip status toward `confirmed`, enough disputes toward `disputed`.
**Consequences:** No new table and no new RPC — the smallest change that gives a real
two-sided trust signal in the incident-detail sheet. `incidents.confirmations` now counts
`confirm` votes only; the dispute count is derived in the RPC.

## ADR-019 — Post-login permissions & safety onboarding
**Context:** The app needs runtime permissions (location; microphone for voice) and, for the
safety layer, a phone number, emergency contacts, and alert rules. Asking for everything
cold, mid-flow, is jarring and easy to deny.
**Decision:** A first-run **"Seguridad y WhatsApp"** screen (also reachable under the Perfil
tab) walks the user through granting permissions (location required; mic optional), enabling
WhatsApp + registering their phone, adding emergency contacts, and setting alert rules
(min severity + radius). Auth screens stay bare (no tab bar); everything post-login sits
behind the 4-tab bottom bar (Mapa · Reportar · Cerca · Perfil).
**Consequences:** Permissions are requested in context with a reason, which lifts grant rates
on the demo devices; the safety layer ([ADR-017](#adr-017--whatsapp-emergency-alerts-messaginggateway-port--hermes-adapter--proximity-dispatcher))
has a single home. The screen degrades gracefully — skip WhatsApp and the core four pillars
are untouched.
