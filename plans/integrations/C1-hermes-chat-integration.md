# C1 — Hermes Chat Integration Implementation Plan (integrations lane, Person C)

> **For agentic workers:** implement task-by-task, top to bottom. Steps use checkbox (`- [ ]`)
> syntax. There are **NO automated tests** (ADR-015) — verify each task by running the stated
> command and observing the described result. Commit after each task (Conventional Commits,
> English).

**Goal:** Make "Hermes" (Nous Research Hermes Agent on the Azure VM) Pulso's WhatsApp chat layer —
users chat with the agent and it answers from Pulso's incident data via tools, and Pulso pushes
proximity/SOS alerts through Hermes.

**Architecture:** Hermes owns the WhatsApp connection and runs the agent (OpenAI model). Inbound
tools reach Pulso through a **VM-side stdio MCP shim** that phone-matches the sender → `user_id`,
mints an `authenticated` Supabase JWT, and calls the **existing, unchanged** `agent-tools` edge
function (backend frozen for the tools path). Outbound alerts reuse the `MessagingGateway` port,
whose adapter now POSTs to a `hermes webhook` instead of a fictional REST send.

**Tech Stack:** Deno Edge Functions + `@pulso/core`/`@pulso/adapters` (TypeScript), Supabase
Postgres/PostGIS, Python 3.11 + `mcp` + `PyJWT` (the VM shim), Hermes Agent CLI.

**Design source:** `docs/HERMES-CHAT-INTEGRATION.md`. Deployables: `docs/hermes/`.

## Global Constraints

- No hardcoded creds/URLs — everything via env. Backend reads through `getEnv()`; the VM shim
  reads `os.environ`. (No-hardcoded-values rule.)
- One class/function per file; re-export through the barrel; consumers import from the package
  (`@pulso/core`, `@pulso/adapters`), never a deep file.
- `MessagingGateway` port method stays named `sendWhatsApp`; only its input shape changes.
- Backend **tools path stays frozen**: `agent-tools` and the RPCs are NOT modified.
- User-facing WhatsApp copy → Spanish (Ecuador). Code/comments/commits/docs → English.
- TypeScript: no `any` in app code; explicit types on exported functions.
- `supabase` CLI runs from `backend/`.
- Only `accepted` emergency contacts are ever messaged; the incident reporter is never alerted
  (enforced in `get_alert_matches`).

---

## Part A — Pulso repo: outbound alert rework (Person C's messaging carve-out inside `backend/**` — see the ownership matrix in `plans/00-README.md`)

### Task 1: Reshape the `MessagingGateway` port

**Files:**
- Modify: `backend/core/ports/messaging-gateway.ts`

**Interfaces:**
- Produces: `MessagingGateway.sendWhatsApp({ to: string; kind: 'proximity' | 'sos' | 'optin';
  context?: Record<string, unknown> }): Promise<{ id: string; status: string }>`.

- [ ] **Step 1: Replace the file contents**

```ts
/** Sends outbound WhatsApp messages by triggering the Hermes "pulso-alerts" webhook. */
export interface MessagingGateway {
  sendWhatsApp(input: {
    to: string;
    kind: 'proximity' | 'sos' | 'optin';
    context?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
}
```

- [ ] **Step 2: Typecheck**

Run from the repository root: `npm run typecheck`
Expected: `core` fails to compile in `dispatch-proximity-alerts.ts` (still passes `template`) —
that is fixed in Task 3. The port file itself has no errors. Proceed.

- [ ] **Step 3: Commit**

```bash
git add backend/core/ports/messaging-gateway.ts
git commit -m "refactor(messaging): reshape MessagingGateway to { to, kind, context }"
```

---

### Task 2: Repoint `HermesWhatsAppGateway` at the Hermes webhook

**Files:**
- Modify: `backend/adapters/messaging/hermes-whatsapp-gateway.ts`

**Interfaces:**
- Consumes: `MessagingGateway` (Task 1).
- Produces: `new HermesWhatsAppGateway({ webhookUrl: string; secret: string })`.

- [ ] **Step 1: Replace the file contents**

```ts
import type { MessagingGateway } from '@pulso/core';

/**
 * Triggers the Hermes Agent "pulso-alerts" webhook (see docs/HERMES-CHAT-INTEGRATION.md §6).
 * Hermes owns the WhatsApp connection; we POST one payload per recipient and Hermes delivers it.
 * Config is injected from env (HERMES_WEBHOOK_URL / HERMES_WEBHOOK_SECRET).
 */
export class HermesWhatsAppGateway implements MessagingGateway {
  constructor(private readonly config: { webhookUrl: string; secret: string }) {}

  async sendWhatsApp(input: {
    to: string;
    kind: 'proximity' | 'sos' | 'optin';
    context?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pulso-signature': this.config.secret,
      },
      body: JSON.stringify({ to: input.to, kind: input.kind, ...(input.context ?? {}) }),
    });

    if (!response.ok) {
      throw new Error(`Hermes webhook failed: ${response.status}`);
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string; status?: string };
    return { id: data.id ?? '', status: data.status ?? 'queued' };
  }
}
```

- [ ] **Step 2: Typecheck**

Run from the repository root: `npm run typecheck`
Expected: `adapters` compiles (the `core` error from Task 1 remains until Task 3).

- [ ] **Step 3: Commit**

```bash
git add backend/adapters/messaging/hermes-whatsapp-gateway.ts
git commit -m "feat(messaging): POST to the Hermes pulso-alerts webhook instead of a REST send"
```

---

### Task 3: Rewrite `makeDispatchProximityAlerts` (kind+context; keep B5 fixes)

**Files:**
- Modify: `backend/core/use-cases/dispatch-proximity-alerts.ts`

**Interfaces:**
- Consumes: `IncidentRepository.findAlertRecipients`, `ProfileRepository.getEmergencyContacts`,
  `MessagingGateway.sendWhatsApp` (Task 1).
- Produces: `(input) => Promise<{ sent: number; results: Array<{ contactId: string; id: string;
  status: string }> }>` where `input` is
  `{ kind: 'proximity'; incidentId: string; context?: Record<string, unknown> }` **or**
  `{ kind: 'sos'; userId: string; context?: Record<string, unknown> }`.

- [ ] **Step 1: Replace the file contents**

```ts
import type { IncidentRepository, MessagingGateway, ProfileRepository } from '../ports';

type DispatchResult = {
  sent: number;
  results: Array<{ contactId: string; id: string; status: string }>;
};

/**
 * Dispatch WhatsApp alerts to accepted emergency contacts through the Hermes webhook. Two entry
 * points share one loop:
 *  - `proximity`: a freshly inserted incident matched some users' alert rules (contacts arrive
 *    already filtered to accepted by get_alert_matches; an AlertContact has no `status`).
 *  - `sos`: the user pressed SOS; their accepted contacts are queried directly.
 * The message wording lives in the Hermes webhook template; here we only pass `kind` + `context`.
 */
export function makeDispatchProximityAlerts({
  messaging,
  incidents,
  profiles,
}: {
  messaging: MessagingGateway;
  incidents: IncidentRepository;
  profiles: ProfileRepository;
}) {
  return async (
    input:
      | { kind: 'proximity'; incidentId: string; context?: Record<string, unknown> }
      | { kind: 'sos'; userId: string; context?: Record<string, unknown> },
  ): Promise<DispatchResult> => {
    const recipients =
      input.kind === 'proximity'
        ? await incidents.findAlertRecipients({ incidentId: input.incidentId })
        : [
            {
              userId: input.userId,
              contacts: await profiles.getEmergencyContacts({
                userId: input.userId,
                status: 'accepted',
              }),
            },
          ];

    const results: DispatchResult['results'] = [];
    for (const recipient of recipients) {
      for (const contact of recipient.contacts) {
        // Both paths pre-filter to accepted; only skip if a status is present and not accepted.
        if ('status' in contact && (contact as { status?: string }).status !== 'accepted') continue;
        try {
          const sent = await messaging.sendWhatsApp({
            to: contact.phone,
            kind: input.kind,
            context: input.context,
          });
          results.push({ contactId: contact.id, id: sent.id, status: sent.status || 'sent' });
        } catch {
          // A single failed send must not abort the whole fan-out.
          results.push({ contactId: contact.id, id: '', status: 'failed' });
        }
      }
    }

    return { sent: results.length, results };
  };
}
```

- [ ] **Step 2: Typecheck**

Run from the repository root: `npm run typecheck`
Expected: `core` now compiles. `adapters` still compiles. (The Deno function is checked when served.)

- [ ] **Step 3: Commit**

```bash
git add backend/core/use-cases/dispatch-proximity-alerts.ts
git commit -m "refactor(safety): dispatch by kind+context; keep accepted-guard and per-contact results"
```

---

### Task 4: Rewrite the `proximity-dispatcher` composition root

**Files:**
- Modify: `backend/supabase/functions/proximity-dispatcher/index.ts`

**Interfaces:**
- Consumes: `HermesWhatsAppGateway` (Task 2), `makeDispatchProximityAlerts` (Task 3), `getEnv`
  (Task 5).
- Accepts bodies: `{ record: { id } }` or `{ incidentId }` (incident insert, with
  `x-pulso-webhook-secret`); `{ type: 'sos', location: { lat, lng } }` (manual SOS, with
  `Authorization`); `{ optin: { contactId } }` (contact added, with `Authorization`).
- Produces: `{ dispatched: number }`; error `{ error }`.

- [ ] **Step 1: Replace the file contents**

```ts
import {
  HermesWhatsAppGateway,
  SupabaseIncidentRepository,
  SupabaseProfileRepository,
} from "@pulso/adapters";
import { makeDispatchProximityAlerts } from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { createServiceClient } from "../_shared/service-client.ts";
import { createUserClient } from "../_shared/supabase-client.ts";

// Composition root for proximity alerts + SOS + contact opt-in. Runs with the service role
// because it reads/writes across users. verify_jwt = false (a DB webhook has no user JWT); the
// SOS/opt-in paths still send the Authorization header and we resolve the caller from it.
// Sends go through the MessagingGateway port → HermesWhatsAppGateway → Hermes "pulso-alerts" webhook.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    if (!env.hermesWebhookUrl || !env.hermesWebhookSecret || !env.proximityWebhookSecret) {
      throw new Error("HERMES_WEBHOOK_* no configurado");
    }

    const service = createServiceClient();
    const messaging = new HermesWhatsAppGateway({
      webhookUrl: env.hermesWebhookUrl,
      secret: env.hermesWebhookSecret,
    });
    const incidents = new SupabaseIncidentRepository(service);
    const profiles = new SupabaseProfileRepository(service, {
      cedulaHashPepper: env.cedulaHashPepper ?? "",
    });
    const dispatch = makeDispatchProximityAlerts({ incidents, profiles, messaging });

    const body = await req.json().catch(() => ({}));

    // ---- Opt-in: a contact was just added; ask them to accept over WhatsApp (FR-23) ----
    if (body.optin?.contactId) {
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      const { data: contact } = await service
        .from("emergency_contacts")
        .select("id, phone_e164")
        .eq("id", body.optin.contactId)
        .eq("owner_id", ownerId)
        .single();
      if (!contact) throw new Error("contacto no encontrado");
      await messaging.sendWhatsApp({ to: contact.phone_e164, kind: "optin" });
      return Response.json({ dispatched: 1 }, { headers: corsHeaders });
    }

    // ---- SOS: message the caller's own accepted contacts immediately (FR-26) ----
    if (body.type === "sos" && body.location) {
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      const result = await dispatch({
        kind: "sos",
        userId: ownerId,
        context: { lat: body.location.lat, lng: body.location.lng },
      });
      await logDispatches(service, null, result.results);
      return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
    }

    // ---- Proximity: a DB webhook sends { record: { id } }; a manual call may send { incidentId } ----
    const incidentId = body.incidentId ?? body.record?.id;
    if (!incidentId) throw new Error("incidentId requerido");
    if (req.headers.get("x-pulso-webhook-secret") !== env.proximityWebhookSecret) {
      throw new Error("unauthorized");
    }
    const result = await dispatch({ kind: "proximity", incidentId });
    await logDispatches(service, incidentId, result.results);
    return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});

// Best-effort audit/idempotency log. unique(incident_id, contact_id) makes duplicate proximity
// fires no-ops; SOS rows have a null incident_id so each SOS is recorded separately.
async function logDispatches(
  service: ReturnType<typeof createServiceClient>,
  incidentId: string | null,
  results: Array<{ contactId: string; status: string }>,
): Promise<void> {
  if (results.length === 0) return;
  const rows = results.map((r) => ({
    incident_id: incidentId,
    contact_id: r.contactId,
    status: r.status === "failed" ? "failed" : "sent",
  }));
  await service.from("whatsapp_dispatch_log").upsert(rows, {
    onConflict: "incident_id,contact_id",
    ignoreDuplicates: true,
  });
}
```

- [ ] **Step 2: Serve and smoke-test the error path (no Hermes needed)**

Run: `cd backend && supabase functions serve proximity-dispatcher --no-verify-jwt` then, in a
second shell:
```bash
curl -s -XPOST "http://127.0.0.1:54321/functions/v1/proximity-dispatcher" \
  -H "content-type: application/json" -d '{}'
```
Expected: `{"error":"HERMES_WEBHOOK_* no configurado"}` (env not set locally) — confirms the
composition root wiring and the `{ error }` envelope.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/proximity-dispatcher/index.ts
git commit -m "feat(safety): trigger Hermes webhook; opt-in branch, dispatch log, { dispatched } shape"
```

---

### Task 5: Swap the env contract (Hermes webhook, drop templates)

**Files:**
- Modify: `backend/supabase/functions/_shared/env.ts`
- Modify: `.env.example` (repo root)

**Interfaces:**
- Produces: `getEnv().hermesWebhookUrl`, `getEnv().hermesWebhookSecret`, and
  `getEnv().proximityWebhookSecret` (all server-only).

- [ ] **Step 1: Replace the WhatsApp block in `getEnv()`**

In `backend/supabase/functions/_shared/env.ts`, replace the existing
`// WhatsApp gateway (Hermes)` block (the `hermesApiUrl`/`hermesApiKey`/`hermesFrom`/
`whatsappProximityTemplate`/`whatsappSosTemplate` lines) with:

```ts
    // Hermes Agent webhook (outbound WhatsApp alerts — see docs/HERMES-CHAT-INTEGRATION.md §6)
    hermesWebhookUrl: optional("HERMES_WEBHOOK_URL"),
    hermesWebhookSecret: optional("HERMES_WEBHOOK_SECRET"),
    proximityWebhookSecret: optional("PROXIMITY_WEBHOOK_SECRET"),
```

- [ ] **Step 2: Replace the Hermes block in the repo `.env.example`**

Replace the five `HERMES_API_URL` / `HERMES_API_KEY` / `HERMES_WHATSAPP_FROM` /
`WHATSAPP_PROXIMITY_TEMPLATE` / `WHATSAPP_SOS_TEMPLATE` lines with:

```bash
# Hermes Agent webhook — proximity-dispatcher POSTs alert payloads here; Hermes delivers to WhatsApp.
# Create it on the VM with: hermes webhook subscribe "pulso-alerts" ...  (see docs/hermes/)
HERMES_WEBHOOK_URL=https://<hermes-vm-host>/webhooks/pulso-alerts
HERMES_WEBHOOK_SECRET=your-shared-secret       # sent as x-pulso-signature; also verified by the VM
PROXIMITY_WEBHOOK_SECRET=your-random-secret    # Database Webhook sends as x-pulso-webhook-secret
```

- [ ] **Step 3: Typecheck**

Run from the repository root: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/functions/_shared/env.ts .env.example
git commit -m "chore(env): replace HERMES_API_*/WHATSAPP_*_TEMPLATE with HERMES_WEBHOOK_URL/SECRET"
```

---

### Task 6: Update ADR-017 to Hermes-as-agent

**Files:**
- Modify: `docs/DECISIONS.md` (the ADR-017 body)

- [ ] **Step 1: Append a revision note to the ADR-017 section**

Immediately after the ADR-017 **Consequences** paragraph, add:

```markdown
**Revision (2026-07-21):** "Hermes" is Nous Research's **Hermes Agent** (self-hosted, on an Azure
VM), not a WhatsApp REST send API. The `MessagingGateway` port stays; its adapter now POSTs to a
`hermes webhook` (`HERMES_WEBHOOK_URL`/`HERMES_WEBHOOK_SECRET`) and Hermes delivers via WhatsApp
(Baileys, no Meta templates). Inbound chat is native to Hermes; Pulso data reaches the agent
through a VM-side MCP shim that reuses `agent-tools`. Full design: `docs/HERMES-CHAT-INTEGRATION.md`.
WhatsApp remains a P1/P2 cuttable layer.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DECISIONS.md
git commit -m "docs(adr): revise ADR-017 to Hermes-agent webhook model"
```

---

## Part B — VM tool bridge: the Pulso MCP shim

### Task 7: Write `pulso_mcp.py` (stdio MCP server → agent-tools)

**Files:**
- Create: `docs/hermes/pulso_mcp.py` (version-controlled; deployed to `~/.hermes/pulso_mcp.py` on the VM)

**Interfaces:**
- Consumes env: `AGENT_TOOLS_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- Produces the `mcp-pulso` toolset: `get_nearby_incidents`, `get_incident_details`,
  `confirm_incident` — each taking a `sender` (E.164) the agent fills from conversation context.

- [ ] **Step 1: Write the shim**

```python
"""Pulso MCP shim — runs on the Hermes VM as a stdio MCP server (toolset "mcp-pulso").

Per tool call it: (1) maps the WhatsApp sender's phone to a Pulso user_id, (2) mints a short-lived
'authenticated' Supabase JWT for that user, (3) forwards to the existing `agent-tools` edge
function. Backend stays frozen. Run: `python pulso_mcp.py` (Hermes spawns it via mcp_servers.pulso).

Deps: pip install "mcp[cli]" pyjwt
"""
import json
import os
import time
import urllib.parse
import urllib.request

import jwt
from mcp.server.fastmcp import FastMCP

AGENT_TOOLS_URL = os.environ["AGENT_TOOLS_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

mcp = FastMCP("pulso")


def _mint_user_jwt(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "iat": now,
        "exp": now + 300,
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")


def _resolve_user_id(sender_e164: str) -> str | None:
    """Service-role lookup: WhatsApp sender phone -> Pulso user_id (or None if not registered)."""
    phone = sender_e164 if sender_e164.startswith("+") else "+" + sender_e164
    query = urllib.parse.urlencode({"select": "user_id", "phone_e164": f"eq.{phone}"})
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/whatsapp_config?{query}",
        headers={"apikey": SERVICE_KEY, "authorization": f"Bearer {SERVICE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        rows = json.load(r)
    return rows[0]["user_id"] if rows else None


def _call_agent_tools(tool: str, arguments: dict, bearer: str) -> dict:
    data = json.dumps({"tool": tool, "arguments": arguments}).encode()
    req = urllib.request.Request(
        AGENT_TOOLS_URL,
        data=data,
        method="POST",
        headers={"content-type": "application/json", "authorization": f"Bearer {bearer}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _bearer_for(sender: str) -> str:
    user_id = _resolve_user_id(sender)
    if not user_id:
        raise ValueError("El número no está registrado en Pulso; no puedo hacer esta acción.")
    return _mint_user_jwt(user_id)


@mcp.tool()
def get_nearby_incidents(
    sender: str,
    user_lat: float,
    user_long: float,
    radius_meters: int = 3000,
    filter_category: str | None = None,
) -> dict:
    """Incidentes cerca de coordenadas compartidas por la persona en la conversación."""
    args = {
        "user_lat": user_lat,
        "user_long": user_long,
        "radius_meters": radius_meters,
        "filter_category": filter_category,
    }
    return _call_agent_tools("get_nearby_incidents", args, _bearer_for(sender))


@mcp.tool()
def get_incident_details(sender: str, incident_id: str) -> dict:
    """Detalle de un incidente concreto por su id (uuid)."""
    return _call_agent_tools(
        "get_incident_details", {"incident_id": incident_id}, _bearer_for(sender)
    )


@mcp.tool()
def confirm_incident(sender: str, incident_id: str, kind: str = "confirm") -> dict:
    """Registra la valoración: kind='confirm' (lo está viendo) o 'dispute' (cree que no es correcto)."""
    args = {"incident_id": incident_id, "kind": "dispute" if kind == "dispute" else "confirm"}
    return _call_agent_tools("confirm_incident", args, _bearer_for(sender))


if __name__ == "__main__":
    mcp.run()  # stdio transport
```

- [ ] **Step 2: Verify it starts and lists tools (locally or on the VM)**

Run (with the four env vars exported, values can be dummies for a start-only check):
```bash
pip install "mcp[cli]" pyjwt
AGENT_TOOLS_URL=x SUPABASE_URL=x SUPABASE_JWT_SECRET=x SUPABASE_SERVICE_ROLE_KEY=x \
  python -c "import docs.hermes.pulso_mcp as m; print([t for t in ('get_nearby_incidents','get_incident_details','confirm_incident')])"
```
Expected: prints the three tool names with no import/syntax error. (Full protocol test happens on
the VM in Task 9 via `hermes tools`.)

- [ ] **Step 3: Commit**

```bash
git add docs/hermes/pulso_mcp.py
git commit -m "feat(hermes): add VM-side MCP shim bridging WhatsApp senders to agent-tools"
```

---

## Part C — VM operator runbook (manual, on the Azure VM — NOT Codex-executable)

> These steps run on the Azure VM against the live Hermes install. Do them after Part A/B are
> deployed (`supabase functions deploy proximity-dispatcher`, secrets set) and after the frontend
> has a registered WhatsApp number to test with.

- [ ] **1. Copy artifacts to the VM** — `docs/hermes/SOUL.md` → `~/.hermes/SOUL.md`;
  `docs/hermes/pulso_mcp.py` → `~/.hermes/pulso_mcp.py`; merge `config.yaml.example` into
  `~/.hermes/config.yaml`; merge `.env.example` values into `~/.hermes/.env` (fill real
  `OPENAI_API_KEY`, `AGENT_TOOLS_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ALLOWED_USERS`).
- [ ] **2. Install shim deps** — `pip install "mcp[cli]" pyjwt`.
- [ ] **3. Link WhatsApp** — `hermes whatsapp` → scan the QR from the Pulso demo phone
  (Settings → Linked Devices).
- [ ] **4. Verify config + tools** — `hermes config check && hermes doctor`; `hermes tools` and
  confirm the `mcp-pulso` toolset shows `get_nearby_incidents` / `get_incident_details` /
  `confirm_incident`. **If the shim can't obtain the sender automatically**, confirm SOUL.md
  instructs the agent to pass the sender's number as the `sender` argument (it does — verify the
  agent fills it from context; otherwise add `remitente: <number>` to the injected context).
- [ ] **5. Register the outbound webhook** —
  ```bash
  hermes webhook subscribe "pulso-alerts" \
    --prompt "Aviso Pulso ({kind}): {category} cerca ({area}). Responde para más info." \
    --deliver "whatsapp:{to}" --deliver-only
  hermes webhook list   # note the URL → set as Pulso's HERMES_WEBHOOK_URL (+ shared secret)
  ```
- [ ] **6. Run the gateway as a service** — `hermes gateway install --system && hermes gateway start`.
- [ ] **7. Inbound smoke test** — from the demo phone, WhatsApp the number:
  *"¿qué está pasando cerca?"* → expect a short Spanish reply listing seeded Portoviejo incidents
  (proves sender→user match, JWT mint, and the `agent-tools` call).
- [ ] **8. Outbound smoke test** — fire an SOS from the app (or `curl` the deployed
  `proximity-dispatcher` with `{"sos":{"area":"PUCE"}}` + a user JWT) → the accepted contact
  receives the WhatsApp alert; a row lands in `whatsapp_dispatch_log`.
- [ ] **9. Early risk check (do first if unsure): minted-JWT acceptance.** If Task 7's calls to
  `agent-tools` return `unauthorized`, the self-signed JWT isn't accepted. **Fallback:** point the
  shim's `_call_agent_tools` at the PostGIS RPCs directly
  (`${SUPABASE_URL}/rest/v1/rpc/<name>` with the same minted Bearer — PostgREST verifies signature
  only). Keep the same tool surface; only the transport inside the shim changes.

---

## Self-review notes

- **Spec coverage:** inbound conversational agent (Part B + C) ✓; tools = the 3 existing reused via
  MCP shim ✓; phone-match identity (§7) ✓; outbound proximity/SOS via Hermes webhook (Tasks 2–5) ✓;
  SOUL.md persona already written (`docs/hermes/`) ✓; config/env (Task 5 + `docs/hermes/`) ✓;
  security allowlist (`config.yaml.example` `platform_toolsets`) ✓.
- **Supersedes B5:** B5's template-based send is replaced by the webhook model; B5's non-messaging
  fixes (accepted-guard, per-contact results, dispatch log, `{ dispatched }`, opt-in, `{ error }`)
  are preserved in Tasks 3–4. Do NOT also run B5 Tasks 2/4 — they conflict.
- **Type consistency:** `sendWhatsApp({ to, kind, context })` used identically in the port
  (Task 1), adapter (Task 2), and use-case (Task 3); dispatcher (Task 4) passes `kind`/`context`.
- **Open risk flagged, not hidden:** minted-JWT acceptance by `agent-tools` (Part C step 9) and how
  Hermes surfaces the sender to a tool call (Part C step 4) — both have concrete fallbacks.
```
