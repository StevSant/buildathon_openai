# Hermes Chat Integration — Design

> **Status:** Design (approved to build the full inbound agent — 2026-07-21).
> **Revises:** [ADR-017](DECISIONS.md) — which described "Hermes" as a WhatsApp *send* REST
> API. That mental model is wrong (see §1). The `MessagingGateway` **port** survives; the
> `HermesWhatsAppGateway` **adapter** is repurposed.
> **Owner artifacts:** deployable Hermes config lives in [`docs/hermes/`](hermes/)
> (`SOUL.md`, `config.yaml.example`, `.env.example`).

## 1. What Hermes actually is (correcting the scaffold)

The scaffolded code (`backend/adapters/messaging/hermes-whatsapp-gateway.ts`) treats Hermes as
*"POST a WhatsApp template to `https://hermes.example.com/api/whatsapp/send`"*. **It is not a
WhatsApp send API.**

**Hermes Agent** (Nous Research, `hermes-agent.nousresearch.com`, MIT, self-hosted) is a full
**agent gateway process**. It:

- **Owns the WhatsApp connection** natively (also Telegram/Discord/Slack/Signal/Email/CLI) — one
  gateway process, one memory across every surface.
- **Is the brain** — runs a model (OpenAI / Nous Portal / custom), reasons, and calls tools.
- Ships 40–60+ built-in tools, **MCP server integration** (`mcp-<server>` dynamic toolsets),
  a skills system (agentskills.io), cron scheduling, and a `hermes webhook` trigger.
- Is **self-hosted** — and for us it already runs on an **Azure VM**.

So Hermes is not something Pulso *calls to send a message*. Hermes is a peer service that
*talks to users on WhatsApp on Pulso's behalf* and *reads Pulso's data through tools we expose*.

## 2. Architecture

```
                    Azure VM  —  hermes gateway (systemd service)
                    ┌──────────────────────────────────────────────┐
  WhatsApp   ◄─────►│  Hermes Agent                                 │
  (user phone)      │    • SOUL.md   → personality / system prompt  │
                    │    • model     → OpenAI (gpt-5.6-*)           │
                    │    • toolset   → mcp-pulso ──────────┐        │
                    │    • webhook   → "pulso-alerts"       │        │
                    └───────────────────────────────────────┼────────┘
                                  ▲                          │ MCP (HTTP/SSE)
              (proactive) hermes  │ webhook POST             ▼
                    ┌─────────────┴──────────┐   ┌────────────────────────────┐
                    │ Supabase Edge Function │   │  Pulso MCP server           │
                    │  proximity-dispatcher  │   │  (wraps @pulso/core)        │
                    │  (incident insert /SOS)│   │   get_nearby_incidents      │
                    └────────────┬───────────┘   │   get_incident_details      │
                                 │               │   confirm_incident          │
                                 ▼               └──────────────┬──────────────┘
                          Postgres + PostGIS  ◄─────────────────┘
                          (incidents, alert_rules, emergency_contacts…)
```

Two independent flows, both through one Hermes instance:

- **Inbound (conversational)** — §5. The new subsystem this design adds.
- **Outbound (proactive alerts)** — §6. Reworks the existing `proximity-dispatcher`.

### Tool bridge — where the MCP server lives (decided: on the VM, backend frozen)

The MCP server is **not** a new Supabase edge function — it is a small **local stdio MCP shim on
the Azure VM** (`~/.hermes/pulso_mcp.py`, registered under `mcp_servers.pulso`). Per WhatsApp turn
it:

1. reads the sender's E.164 number (§7),
2. service-role lookup `phone → whatsapp_config.phone_e164 → user_id`,
3. mints a short-lived `authenticated` Supabase JWT for that `user_id` (signed with
   `SUPABASE_JWT_SECRET`, held on the VM),
4. forwards the `tools/call` to the **existing, unchanged** `agent-tools` edge function with that
   Bearer — so RLS resolves `auth.uid()` correctly and all three tools run as the real user.

Net effect: **zero new backend code** — the shim + secrets live entirely on the VM you already
run; `agent-tools` and `@pulso/core` are reused as-is. *(Rejected: a new `pulso-mcp` edge function
— grows the backend; a non-MCP VM skill — less idiomatic, loses the clean tool boundary.)*

## 3. Deployment (Azure VM)

Hermes already runs on the VM. Target state:

```bash
hermes setup                       # base config (or `hermes config migrate`)
hermes whatsapp                    # QR-link the Pulso WhatsApp number (§4)
hermes config edit                 # apply docs/hermes/config.yaml.example
#   ~/.hermes/.env      ← docs/hermes/.env.example
#   ~/.hermes/SOUL.md   ← docs/hermes/SOUL.md
hermes config check && hermes doctor
hermes gateway install --system    # run at boot as a systemd service
hermes gateway start
```

All Hermes state lives in `~/.hermes/` on the VM: `config.yaml`, `.env`, `SOUL.md`, `auth.json`,
`skills/`, `sessions/`, `platforms/whatsapp/session`.

## 4. WhatsApp connection — Baileys (QR) for the demo

Hermes offers two WhatsApp methods:

| Method | How | Business-initiated msgs | Setup cost | Verdict |
|---|---|---|---|---|
| **WhatsApp Web / Baileys** | QR-link a normal number (`hermes whatsapp`) | **Free-form, no template approval** | Minutes | ✅ **Demo** |
| WhatsApp Business Cloud API | Meta app + phone number ID | Only **pre-approved templates**, 24 h session window | Days (Meta review) | Production |

**For the hackathon, use Baileys.** It sidesteps Meta's template-approval process entirely — the
proximity/SOS alerts (which are business-*initiated*) can be sent as plain text, which the Cloud
API would forbid without approved templates. This is why the old `WHATSAPP_*_TEMPLATE` env vars
become **unnecessary** for the demo path.

> ⚠️ Baileys is unofficial → ban risk + periodic re-pairing. Fine for a demo on a burner number;
> the doc notes Cloud API as the production migration. Sessions in
> `~/.hermes/platforms/whatsapp/session` are credentials — protect them.

`.env`: `WHATSAPP_ENABLED=true`, `WHATSAPP_MODE=bot`, `WHATSAPP_ALLOWED_USERS=<demo numbers>`
(use the specific demo phones during judging; `*` opens it to everyone).

## 5. Inbound conversational flow (the new subsystem)

**User → Hermes → Pulso tools → reply.** No webhook *we* build — Hermes owns the transport.

1. A user messages the Pulso WhatsApp number (e.g. *"¿qué está pasando cerca de la PUCE?"*).
2. Hermes gateway routes it to the agent (SOUL.md persona + OpenAI model).
3. The agent decides to call `get_nearby_incidents` / `get_incident_details` / `confirm_incident`
   from the **`mcp-pulso`** toolset.
4. The MCP server executes the matching `@pulso/core` use-case against Postgres and returns rows.
5. The agent phrases a short Spanish reply; Hermes sends it back on WhatsApp.

The three tools already exist for the "Cerca" voice agent (`REALTIME_TOOLS` +
`backend/supabase/functions/agent-tools`), so **no new tool functions are needed** — "ask about
this incident" and "ask about other cases" are both covered. We only add the MCP transport.

## 6. Outbound proactive alerts (rework of the existing path)

`proximity-dispatcher` no longer POSTs a WhatsApp template. It **triggers Hermes** via
`hermes webhook`:

1. `hermes webhook subscribe "pulso-alerts"` runs on the VM, exposing a URL.
2. On incident insert (DB webhook) or SOS, `proximity-dispatcher` resolves the recipient
   contacts (unchanged: `get_alert_matches` / accepted `emergency_contacts`) and **POSTs one
   payload per recipient** to the `pulso-alerts` webhook: `{ to, kind, incident, distance }`.
3. Hermes delivers to WhatsApp. Two modes:
   - **SOS** → `--deliver-only` (deterministic, no LLM): *"🆘 <name> activó un SOS cerca de ti…"*.
   - **Proximity** → let the agent phrase it warmly, or `--deliver-only` for speed/cost.

**Port/adapter impact:** the `MessagingGateway` port stays. `HermesWhatsAppGateway.sendWhatsApp`
is re-implemented to POST to the Hermes webhook URL (env `HERMES_WEBHOOK_URL` + a shared secret)
instead of a fictional `/whatsapp/send`. `template`/`params` give way to a `{ kind, text|context }`
payload. `WHATSAPP_PROXIMITY_TEMPLATE` / `WHATSAPP_SOS_TEMPLATE` / `WHATSAPP_OPTIN_TEMPLATE` are
retired for the Baileys demo path.

## 7. Security & consent (must-haves before this is public)

- **CRITICAL — allowlist tools per platform.** Hermes ships shell/terminal, web, browser, and
  image-gen tools. A public WhatsApp bot with shell access is a remote-code-execution hole.
  Hermes controls tools **inclusively** via `platform_toolsets` (verified against the repo — there
  is no `disabled_toolsets` in `cli-config.yaml.example`): assign WhatsApp **only** `mcp-pulso`, so
  no dangerous toolset is ever reachable from a chat. Also pin `terminal.backend: docker` as
  defence-in-depth.
- **Identity by phone match (authenticates the user).** The WhatsApp sender number is
  asserted by the transport — it is *not* self-reported. The shim maps
  `sender_e164 → whatsapp_config.phone_e164 → user_id` with the service role, mints a short-lived
  JWT for that matched Pulso account, and runs every tool as that user. **Unmatched senders cannot
  invoke any Pulso tool.** `get_nearby_incidents` also requires explicit `user_lat` and
  `user_long`; Hermes must never invent a location or substitute venue coordinates.
  **Remaining dependency (test on the VM):** whether an MCP `tools/call` carries the WhatsApp
  sender context. If yes → automatic + strict. If no → surface the sender in the agent context
  (system prompt `remitente: +593…`) and pass it as a tool arg (works, model-mediated).
  **Honest limit** (per ADR-017): trust assumes the registered number belongs to the app user;
  the mis-registration edge case is why production wants OTP at registration.
- **Consent / anti-abuse.** Honour the existing opt-in model (ADR-017): only `accepted`
  emergency contacts receive proactive alerts; respect "BAJA" to opt out; `WHATSAPP_ALLOWED_USERS`
  gates who the bot even talks to during the demo.
- **Emergencies.** SOUL.md instructs the agent to redirect real emergencies to **ECU 911** — it
  is an information assistant, not a first responder.

## 8. Config reference (everything on Hermes)

See the deployable files in [`docs/hermes/`](hermes/). Summary:

| File (`~/.hermes/`) | Purpose | Key entries |
|---|---|---|
| `.env` | secrets | `WHATSAPP_ENABLED`, `WHATSAPP_MODE`, `WHATSAPP_ALLOWED_USERS`, `OPENAI_API_KEY`, `AGENT_TOOLS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `PULSO_WEBHOOK_SECRET` |
| `config.yaml` | behaviour | `model:` (OpenAI), `platforms.whatsapp`, `mcp_servers.pulso` (→ toolset `mcp-pulso`), `platform_toolsets.whatsapp: [mcp-pulso]` (allowlist), `terminal.backend: docker` |
| `SOUL.md` | personality | agent identity, tone, tool rules, safety (§9) |
| `auth.json` | OAuth | only if Nous Portal is used for the model |

Pulso side (repo `.env` / Supabase secrets), replacing the old `HERMES_*` send vars:

| Var | Purpose |
|---|---|
| `HERMES_WEBHOOK_URL` | the `pulso-alerts` webhook the dispatcher POSTs to |
| `HERMES_WEBHOOK_SECRET` | shared secret to authenticate the POST |
| `PROXIMITY_WEBHOOK_SECRET` | shared secret authenticating the database webhook that invokes `proximity-dispatcher` |
| *(no new tool endpoint)* | tools reuse `agent-tools` unchanged; the VM shim holds `SUPABASE_JWT_SECRET` to mint per-user JWTs — backend frozen |

## 9. Agent personality

Full text: [`docs/hermes/SOUL.md`](hermes/SOUL.md) (deploy to `~/.hermes/SOUL.md`; it occupies
system-prompt slot #1). It reuses the **"Cerca"** identity from the in-app voice agent
(`create-realtime-session/personas.ts`) so users meet **one** assistant across voice and WhatsApp
— which also showcases Hermes' single-memory-across-surfaces story. Written in Ecuadorian Spanish
(matching the product locale and the existing persona), it defines: identity, objective, tone,
tool-use rules, incident-status semantics, WhatsApp formatting limits, privacy, and emergency
redirection.

## 10. What changes in the Pulso repo (for the implementation plan)

Design-only for now; these are the code edits `writing-plans` will sequence:

1. **New (VM-side, not backend):** `~/.hermes/pulso_mcp.py` — a stdio MCP shim that phone-matches
   the sender, mints an `authenticated` JWT, and forwards `tools/call` to the **existing**
   `agent-tools` edge function. No new Supabase edge function; the backend stays frozen.
2. **Rework:** `HermesWhatsAppGateway` → POST to `HERMES_WEBHOOK_URL` with the shared secret.
3. **Rework:** `proximity-dispatcher` → send `{ to, kind, incident }` per recipient; drop templates.
4. **Edit:** `_shared/env.ts` + repo `.env.example` → use `HERMES_WEBHOOK_URL`,
   `HERMES_WEBHOOK_SECRET`, and `PROXIMITY_WEBHOOK_SECRET`.
5. **Update:** ADR-017 to reflect Hermes-as-agent; note WhatsApp remains a P1/P2 cuttable layer.

## 11. Rubric fit

- **Uso de OpenAI (25):** the Hermes agent's model is OpenAI (`gpt-5.6-*`), joining the vision
  (`analyze-report`) and Realtime ("Cerca") uses — OpenAI now powers report structuring, the voice
  agent, **and** the WhatsApp agent.
- **Producto funcional (30) / Impacto (10):** a citizen with no app installed can ask about
  nearby incidents and receive safety alerts entirely over WhatsApp — directly serving ODS 11
  (safe, resilient cities) and ODS 13 (risk response) for Manabí.
- **Ejecución técnica (20):** the hexagonal seam holds — Hermes slots behind the existing
  `MessagingGateway` port; the tool layer is reused, not rebuilt.
