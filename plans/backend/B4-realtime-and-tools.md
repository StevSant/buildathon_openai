# B4 — Realtime Session & Agent Tools Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Backend (`backend/supabase/functions/create-realtime-session/**`,
`backend/supabase/functions/agent-tools/**`, `backend/adapters/ai/**` (realtime)).
**Goal:** Mint an ephemeral OpenAI Realtime client secret for a chosen persona (the real key
never reaches the browser), and provide the `agent-tools` router the browser bridge calls so the
voice agent answers only from real incident data.
**Depends on:** B1 (RPCs), and the incident repository + get/confirm use-cases that `agent-tools`
wires (`SupabaseIncidentRepository`, `makeGetNearbyIncidents`, `makeGetIncidentDetails`,
`makeConfirmIncident`) — the same logic F2 exercises directly.
**Reads from CONTRACT:** §3.2 (RPC shapes), §4 (`create-realtime-session`, `agent-tools`), §5 (tool contracts).

## Global Constraints (apply to every task)
- No hardcoded model/voice/keys — `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`,
  `OPENAI_REALTIME_VOICE`, `OPENAI_BASE_URL` from `getEnv()`.
- One class/function per file; barrel re-exports.
- Persona instructions are Spanish and layered (the client sends only a validated `personaId`,
  never a raw prompt). Comments/commits → English.
- The server derives the user from the JWT (`userFromJwt`); tool args from the model are
  validated, and a `user_id` in the body is never trusted.
- `supabase` CLI runs from `backend/`.

**Scaffold reality (verified):** the `create-realtime-session` composition root, `PERSONAS`
(cerca + ruta), `REALTIME_TOOLS`, the `OpenAIRealtimeSessionFactory`, and the `agent-tools`
router all already have working bodies. This plan closes: (1) the session response omits `voice`
(CONTRACT §4 lists it) and drops `context`; (2) the factory has a client-secret-shape `TODO`;
(3) `agent-tools` reads `args.user_lat`/`args.user_long`, but CONTRACT §5 says the frontend (F4)
injects **`{ lat, lng }`** — align to `lat`/`lng`; (4) error envelopes are `{ message }` — align
to `{ error }` per CONTRACT §4; (5) a stale `apps/web/...` comment.

**FRs covered:** FR-12 (ephemeral secret; key stays server-side), FR-13 (answers only via tools,
never invents), FR-14/FR-15 (nearby + details tools), FR-16 (server-side validation + JWT).
P2: the `ruta` mobility persona.

---

### Task 1: Return `voice` (and pass `context`) from create-realtime-session

**Files:**
- Modify: `backend/supabase/functions/create-realtime-session/index.ts`

**Interfaces:**
- Consumes: request `{ personaId: 'cerca' | 'ruta', context?: { lat?, lng? } }`.
- Produces: response `{ clientSecret, expiresAt, model, voice }` (CONTRACT §4).

- [ ] **Step 1: Add `voice` to the response and forward `context`**

Replace the `createAgentSession` call + response with:

```ts
    const createAgentSession = makeCreateAgentSession({ sessions });
    const result = await createAgentSession({
      personaId,
      context: typeof body.context === "object" && body.context ? body.context : undefined,
    });

    // The client needs the model id AND the voice to open the WebRTC connection.
    return Response.json(
      { ...result, model: env.openaiRealtimeModel, voice: env.openaiRealtimeVoice },
      { headers: corsHeaders },
    );
```

- [ ] **Step 2: Align the error envelope to `{ error }`**

In the `catch`, change `Response.json({ message }, …)` to `Response.json({ error: message }, …)`
(CONTRACT §4 error envelope).

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/create-realtime-session/index.ts
git commit -m "feat(realtime): return voice + forward context; standardize error envelope"
```

---

### Task 2: Harden the ephemeral client-secret mint

The current factory reads `data.client_secret?.value ?? data.value` defensively — that already
covers the `POST /v1/realtime/client_secrets` response (which returns a top-level `value` +
`expires_at`). Resolve the `TODO` by keeping the defensive read but failing loudly if no secret
came back, so the browser never receives an empty secret.

**Files:**
- Modify: `backend/adapters/ai/openai-realtime-session-factory.ts` (the block after the fetch)

**Interfaces:**
- Produces: `createSession({ personaId, context? })` → `{ clientSecret, expiresAt }`, throwing on
  a non-OK response OR an empty secret.

- [ ] **Step 1: Replace the parse block (drop the TODO)**

```ts
    // POST /v1/realtime/client_secrets returns { value, expires_at, session }. Older/newer
    // shapes may nest it under client_secret — read both defensively.
    const data = (await response.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value: string; expires_at: number };
    };
    const clientSecret = data.client_secret?.value ?? data.value ?? '';
    const expiresAtEpoch = data.client_secret?.expires_at ?? data.expires_at;
    if (!clientSecret) {
      throw new Error('Realtime mint returned no client secret');
    }
    const expiresAt = expiresAtEpoch ? new Date(expiresAtEpoch * 1000).toISOString() : '';

    return { clientSecret, expiresAt };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/adapters/ai/openai-realtime-session-factory.ts
git commit -m "fix(realtime): guard empty client secret from the realtime mint"
```

---

### Task 3: Align agent-tools to the CONTRACT §5 argument shape

CONTRACT §5: the browser bridge injects the user's `{ lat, lng }` into the
`get_nearby_incidents` arguments (the model never sends coordinates). The router must read
`lat`/`lng` (not `user_lat`/`user_long`). Also standardize the error envelope and validate tool args.

**Files:**
- Modify: `backend/supabase/functions/agent-tools/index.ts`

**Interfaces:**
- Consumes: `{ tool: 'get_nearby_incidents' | 'get_incident_details' | 'confirm_incident',
  arguments: object }` where `get_nearby_incidents` args include `{ lat, lng, radius_meters?,
  filter_category? }` (F4 injects lat/lng).
- Produces: the §3.2 JSON shapes; error `{ error }`.

- [ ] **Step 1: Rewrite the router**

```ts
import { SupabaseIncidentRepository } from "@pulso/adapters";
import {
  makeGetNearbyIncidents,
  makeGetIncidentDetails,
  makeConfirmIncident,
} from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { userFromJwt } from "../_shared/auth.ts";
import { createUserClient } from "../_shared/supabase-client.ts";

// The tool implementation the browser bridge calls (OpenAI never calls Supabase directly).
// Router over the three agent tools. Runs with a USER-scoped client so the security-invoker
// RPCs resolve auth.uid() to the real caller — a user_id in the body is never trusted.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userId = await userFromJwt(req);
    const incidents = new SupabaseIncidentRepository(createUserClient(req));
    const { tool, arguments: args = {} } = await req.json();

    let result: unknown;
    switch (tool) {
      case "get_nearby_incidents": {
        // The frontend injects the user's real { lat, lng } (CONTRACT §5).
        if (typeof args.lat !== "number" || typeof args.lng !== "number") {
          return Response.json(
            { error: "lat/lng requeridos" },
            { status: 400, headers: corsHeaders },
          );
        }
        const run = makeGetNearbyIncidents({ incidents });
        result = await run({
          lat: args.lat,
          long: args.lng,
          radiusMeters: typeof args.radius_meters === "number" ? args.radius_meters : undefined,
          category: args.filter_category ?? null,
        });
        break;
      }
      case "get_incident_details": {
        if (typeof args.incident_id !== "string") {
          return Response.json(
            { error: "incident_id requerido" },
            { status: 400, headers: corsHeaders },
          );
        }
        const run = makeGetIncidentDetails({ incidents });
        result = await run({ incidentId: args.incident_id });
        break;
      }
      case "confirm_incident": {
        if (typeof args.incident_id !== "string") {
          return Response.json(
            { error: "incident_id requerido" },
            { status: 400, headers: corsHeaders },
          );
        }
        const run = makeConfirmIncident({ incidents });
        result = await run({
          userId,
          incidentId: args.incident_id,
          kind: args.kind === "dispute" ? "dispute" : "confirm",
        });
        break;
      }
      default:
        return Response.json(
          { error: `unknown tool: ${tool}` },
          { status: 400, headers: corsHeaders },
        );
    }

    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
```

- [ ] **Step 2: Confirm the incident repository + use-cases exist and compile**

Run: `npm run typecheck`
Expected: no errors. If `SupabaseIncidentRepository`, `makeGetNearbyIncidents`,
`makeGetIncidentDetails`, or `makeConfirmIncident` are missing/incomplete, implement them to the
CONTRACT §3.2 shapes (they wrap the same three RPCs F2 calls) before proceeding — the map RPCs
were finalized in B1.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/agent-tools/index.ts
git commit -m "fix(agent-tools): read injected lat/lng per CONTRACT §5; standardize error envelope"
```

---

### Task 4: Fix the stale path comment in the tool contracts

**Files:**
- Modify: `backend/supabase/functions/create-realtime-session/tools.ts` (top comment)

**Interfaces:** none (comment only). The tool names/keys already match CONTRACT §5 — do NOT change them.

- [ ] **Step 1: Update the comment**

Change `Mirrors apps/web/lib/realtime-tools.ts` to `Mirrors frontend/lib/realtime-tools.ts`.

- [ ] **Step 2: Confirm names match CONTRACT §5**

Verify (no change): `get_nearby_incidents({ radius_meters?, filter_category? })`,
`get_incident_details({ incident_id })`, `confirm_incident({ incident_id, kind })`. F4's
`REALTIME_TOOLS` must stay byte-for-byte aligned on these names/keys.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/create-realtime-session/tools.ts
git commit -m "docs(realtime): point tool-contract comment at frontend/ after reorg"
```

---

### Task 5: Verify end-to-end against the local stack

Both functions have `verify_jwt = true`; reuse the B2 token flow.

**Files:** none (verification only).

- [ ] **Step 1: Serve both functions with an OpenAI key**

Add `OPENAI_API_KEY=…` to `backend/supabase/functions/.env`, then (from `backend/`):
```bash
cd backend && supabase functions serve --env-file supabase/functions/.env
```
Expected: serves `create-realtime-session`, `agent-tools`, and the others.

- [ ] **Step 2: Mint a session**

```bash
curl -s "http://127.0.0.1:54321/functions/v1/create-realtime-session" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"personaId":"cerca"}'
```
Expected: `{"clientSecret":"ek_…","expiresAt":"…","model":"…","voice":"…"}` — a non-empty secret.

- [ ] **Step 3: Call agent-tools with injected coordinates (uses the B1 seed)**

```bash
curl -s "http://127.0.0.1:54321/functions/v1/agent-tools" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"tool":"get_nearby_incidents","arguments":{"user_lat":-1.05458,"user_long":-80.45445}}'
```
Expected: a JSON array of seeded incidents (each with `lat`/`lng`, `distance_meters`) — proving
the agent answers from real data (FR-13/FR-14).

- [ ] **Step 4: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(realtime): session mint + agent-tools verified against seed"
```

---

## Self-review notes
- **Coverage:** FR-12 (ephemeral secret, key server-side) ✓; FR-13 (persona forbids inventing;
  tools return real rows) ✓; FR-14/FR-15 (nearby + details tools) ✓; FR-16 (JWT-derived user,
  validated args) ✓; P2 `ruta` persona present ✓.
- **Contract:** response `{ clientSecret, expiresAt, model, voice }`; tool names/keys per §5;
  `agent-tools` reads injected `{ lat, lng }` (F4 must inject the same keys); errors `{ error }`.
- **Lane:** only `backend/**`.
