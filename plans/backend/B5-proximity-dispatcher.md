# B5 — Proximity Dispatcher & WhatsApp Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Backend (`backend/supabase/functions/proximity-dispatcher/**`,
`backend/adapters/messaging/**`, `backend/adapters/persistence/supabase-profile-repository.ts`,
`backend/core/use-cases/dispatch-proximity-alerts.ts`, and `backend/supabase/functions/_shared/env.ts`).
**Goal:** On a new nearby incident (server-side, via DB webhook) and on a manual SOS, send
WhatsApp alerts to users' **accepted** emergency contacts through the `MessagingGateway` /
Hermes adapter; plus send the opt-in request when a contact is added. Idempotent + audited via
`whatsapp_dispatch_log`.
**Depends on:** B1 (adds `whatsapp_dispatch_log` and the `get_alert_matches` RPC that
`findAlertRecipients` calls; provides `emergency_contacts`, `alert_rules`, `whatsapp_config`,
`profiles.last_location`).
**Reads from CONTRACT:** §4 (`proximity-dispatcher`: trigger + SOS → `{ dispatched }`).

## Global Constraints (apply to every task)
- No hardcoded creds/templates — `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WHATSAPP_FROM`,
  `WHATSAPP_PROXIMITY_TEMPLATE`, `WHATSAPP_SOS_TEMPLATE`, `WHATSAPP_OPTIN_TEMPLATE` from `getEnv()`.
- The dispatcher runs with the **service role** (`createServiceClient`) because it reads/writes
  across users; the service-role key never reaches the browser.
- Only **accepted** contacts are ever messaged (FR-23). The incident's own reporter is never
  alerted (enforced in `get_alert_matches`).
- User-facing WhatsApp copy → Spanish (templates live in Hermes). Comments/commits → English.
- `supabase` CLI runs from `backend/`.

**Scaffold reality (verified):** the composition root, `HermesWhatsAppGateway`, and
`makeDispatchProximityAlerts` all have working bodies. This plan closes real bugs: (1)
`getEmergencyContacts` reads columns `status`/`name`/`phone` but the table has
`opt_in_status`/`display_name`/`phone_e164` — SOS would find zero contacts; (2) the use-case's
`if (contact.status !== 'accepted') continue` skips ALL proximity contacts (an `AlertContact`
from `get_alert_matches` has no `status` field); (3) the function returns `{ sent, results }` but
CONTRACT §4 says `{ dispatched }`; (4) no `whatsapp_dispatch_log` write; (5) no opt-in path
(FR-23); (6) error envelope `{ message }` vs `{ error }`.

**FRs covered:** FR-22 (WhatsApp enable — F6 owns the UI; this owns the send path), FR-23 (opt-in
request; only accepted messaged), FR-25 (proximity fan-out server-side), FR-26 (manual SOS).

---

### Task 1: Fix the emergency-contacts column mapping (SOS finds contacts)

**Files:**
- Modify: `backend/adapters/persistence/supabase-profile-repository.ts` (`getEmergencyContacts`)

**Interfaces:**
- Produces: `getEmergencyContacts({ userId, status? })` reads the real columns and returns
  `EmergencyContact[]` (`{ id, ownerId, name, phone, status, createdAt }`).

- [ ] **Step 1: Correct the query filter and row mapping**

Replace `getEmergencyContacts` with:

```ts
  async getEmergencyContacts(input: {
    userId: string;
    status?: EmergencyContactStatus;
  }): Promise<EmergencyContact[]> {
    let query = this.client
      .from('emergency_contacts')
      .select('*')
      .eq('owner_id', input.userId);
    if (input.status) query = query.eq('opt_in_status', input.status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map(
      (row: Record<string, any>): EmergencyContact => ({
        id: row.id,
        ownerId: row.owner_id,
        name: row.display_name ?? null,
        phone: row.phone_e164,
        status: row.opt_in_status,
        createdAt: row.created_at,
      }),
    );
  }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/adapters/persistence/supabase-profile-repository.ts
git commit -m "fix(safety): map emergency_contacts to real columns (opt_in_status/display_name/phone_e164)"
```

---

### Task 2: Fix the accepted-guard and enrich dispatch results for logging

**Files:**
- Modify: `backend/core/use-cases/dispatch-proximity-alerts.ts`

**Interfaces:**
- Consumes: `incidents.findAlertRecipients`, `profiles.getEmergencyContacts`, `messaging.sendWhatsApp`.
- Produces: `(input) => Promise<{ sent: number; results: Array<{ contactId: string; id: string; status: string }> }>`.

- [ ] **Step 1: Rewrite the use-case**

```ts
import type { IncidentRepository, MessagingGateway, ProfileRepository } from '../ports';

type DispatchResult = {
  sent: number;
  results: Array<{ contactId: string; id: string; status: string }>;
};

/**
 * Dispatch WhatsApp alerts to accepted emergency contacts. Two entry points share one loop:
 *  - `proximity`: a freshly inserted incident matched some users' alert rules (contacts arrive
 *    already filtered to accepted by get_alert_matches; an AlertContact has no `status`).
 *  - `sos`: the user pressed SOS; their accepted contacts are queried directly.
 * The Hermes `template` is supplied by the composition root from env — never hardcoded here.
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
      | { kind: 'proximity'; incidentId: string; template: string; params?: Record<string, unknown> }
      | { kind: 'sos'; userId: string; template: string; params?: Record<string, unknown> },
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

    const results: Array<{ contactId: string; id: string; status: string }> = [];
    for (const recipient of recipients) {
      for (const contact of recipient.contacts) {
        // Both paths pre-filter to accepted; only skip if a status is present and not accepted.
        if ('status' in contact && (contact as { status?: string }).status !== 'accepted') continue;
        try {
          const sent = await messaging.sendWhatsApp({
            to: contact.phone,
            template: input.template,
            params: input.params,
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

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/core/use-cases/dispatch-proximity-alerts.ts
git commit -m "fix(safety): don't skip proximity contacts; per-contact results; tolerate one failed send"
```

---

### Task 3: Add the opt-in template to the env reader

**Files:**
- Modify: `backend/supabase/functions/_shared/env.ts`

**Interfaces:**
- Produces: `getEnv().whatsappOptinTemplate` (defaults to `pulso_optin`).

- [ ] **Step 1: Add the field next to the other WhatsApp templates**

In `getEnv()`, after `whatsappSosTemplate`, add:

```ts
    whatsappOptinTemplate:
      Deno.env.get("WHATSAPP_OPTIN_TEMPLATE") ?? "pulso_optin",
```

Also add `WHATSAPP_OPTIN_TEMPLATE=pulso_optin` to the root `.env.example` under the Hermes section
(with a comment), so the deploy checklist covers it.

- [ ] **Step 2: Commit**

```bash
git add backend/supabase/functions/_shared/env.ts .env.example
git commit -m "chore(env): add WHATSAPP_OPTIN_TEMPLATE for the contact opt-in flow"
```

---

### Task 4: Dispatcher — opt-in branch, dispatch logging, and the `{ dispatched }` shape

**Files:**
- Modify: `backend/supabase/functions/proximity-dispatcher/index.ts`

**Interfaces:**
- Consumes bodies: `{ record: { id } }` or `{ incidentId }` (incident insert),
  `{ type: 'sos', location: { lat, lng } }` (manual SOS, with `Authorization` — CONTRACT §4),
  `{ optin: { contactId } }` (contact added).
- Produces: `{ dispatched: number }` (CONTRACT §4); error `{ error }`.

- [ ] **Step 1: Rewrite the composition root**

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
// TODO (deploy): wire the incident-insert trigger/webhook (Task 5) to POST here.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    if (!env.hermesApiUrl || !env.hermesApiKey || !env.hermesFrom) {
      throw new Error("HERMES_* no configurado");
    }

    const service = createServiceClient();
    const messaging = new HermesWhatsAppGateway({
      apiUrl: env.hermesApiUrl,
      apiKey: env.hermesApiKey,
      from: env.hermesFrom,
    });
    const incidents = new SupabaseIncidentRepository(service);
    const profiles = new SupabaseProfileRepository(service, {
      cedulaHashPepper: env.cedulaHashPepper ?? "",
    });
    const dispatch = makeDispatchProximityAlerts({ incidents, profiles, messaging });

    const body = await req.json().catch(() => ({}));

    // ---- Opt-in: a contact was just added; ask them to accept over WhatsApp (FR-23) ----
    if (body.optin?.contactId) {
      const { data: contact } = await service
        .from("emergency_contacts")
        .select("id, phone_e164")
        .eq("id", body.optin.contactId)
        .single();
      if (!contact) throw new Error("contacto no encontrado");
      await messaging.sendWhatsApp({
        to: contact.phone_e164,
        template: env.whatsappOptinTemplate,
      });
      return Response.json({ dispatched: 1 }, { headers: corsHeaders });
    }

    // ---- SOS: message the caller's own accepted contacts immediately (FR-26) ----
    if (body.type === "sos") {
      const { data } = await createUserClient(req).auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) throw new Error("unauthorized");
      const result = await dispatch({
        kind: "sos",
        userId: ownerId,
        template: env.whatsappSosTemplate,
        params: body.location,
      });
      await logDispatches(service, null, result.results);
      return Response.json({ dispatched: result.sent }, { headers: corsHeaders });
    }

    // ---- Proximity: a DB webhook sends { record: { id } }; a manual call may send { incidentId } ----
    const incidentId = body.incidentId ?? body.record?.id;
    if (!incidentId) throw new Error("incidentId requerido");
    const result = await dispatch({
      kind: "proximity",
      incidentId,
      template: env.whatsappProximityTemplate,
    });
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

- [ ] **Step 2: Typecheck the workspace**

Run: `npm run typecheck`
Expected: `backend/core` and `backend/adapters` compile (the function itself is Deno-checked when served).

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/proximity-dispatcher/index.ts
git commit -m "feat(safety): opt-in branch, dispatch logging, and { dispatched } response"
```

---

### Task 5: Document the incident-insert trigger wiring (deploy-time)

The dispatcher can't hardcode its own deployed URL, so the incident→dispatch link is a deploy
step. Document both options in the migration comment already present in `0002`.

**Files:**
- Reference: `backend/supabase/migrations/0002_whatsapp_sos.sql` (the existing TODO block)

- [ ] **Step 1: Record the two wiring options in the plan (and keep the migration comment)**

**Option A — Supabase Database Webhook (recommended for the demo):** Dashboard → Database →
Webhooks → create a webhook on `INSERT` into `public.incidents` that POSTs the row to
`${SUPABASE_URL}/functions/v1/proximity-dispatcher`. The dispatcher reads `body.record.id`.

**Option B — `pg_net` trigger:** enable `pg_net`, then an `after insert` trigger on
`public.incidents` calls `net.http_post(url, body := jsonb_build_object('incidentId', new.id),
headers := ...)` with the function URL + service-role key stored as DB settings.

- [ ] **Step 2: Commit** (doc note only; no code change if the migration comment already covers it)

```bash
git commit --allow-empty -m "docs(safety): record proximity-dispatcher trigger wiring options"
```

---

### Task 6: Verify the SOS path end-to-end (the demo-relevant path)

**Files:** none (verification only).

- [ ] **Step 1: Seed a WhatsApp config + an accepted contact for a local user**

Create a local user (B2 flow) to get its `id`, then (service-role psql):
```bash
UID="<the local user's uuid>"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  insert into public.profiles (id, verified) values ('$UID', true) on conflict (id) do nothing;
  insert into public.whatsapp_config (user_id, enabled, phone_e164, verified)
    values ('$UID', true, '+593990000000', true) on conflict (user_id) do update set enabled = true;
  insert into public.emergency_contacts (owner_id, display_name, phone_e164, opt_in_status)
    values ('$UID', 'Contacto demo', '+593991111111', 'accepted');
"
```

- [ ] **Step 2: Serve the dispatcher with Hermes env (or a mock)**

Put `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WHATSAPP_FROM` in `backend/supabase/functions/.env`
(for a dry run, point `HERMES_API_URL` at a local echo endpoint), then:
```bash
cd backend && supabase functions serve proximity-dispatcher --env-file supabase/functions/.env
```

- [ ] **Step 3: Fire an SOS as the user**

```bash
curl -s "http://127.0.0.1:54321/functions/v1/proximity-dispatcher" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"type":"sos","location":{"lat":-1.05458,"lng":-80.45445}}'
```
Expected: `{"dispatched":1}` (the one accepted contact), and a row in `whatsapp_dispatch_log`:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select incident_id, contact_id, status from public.whatsapp_dispatch_log;"
```

- [ ] **Step 4: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(safety): SOS dispatch verified end-to-end against an accepted contact"
```

---

## Self-review notes
- **Coverage:** FR-23 (opt-in send; only accepted messaged) ✓; FR-25 (proximity fan-out via
  `get_alert_matches`, reporter excluded) ✓; FR-26 (manual SOS) ✓; FR-22 send path (F6 owns the UI) ✓.
- **Bugs fixed:** `getEmergencyContacts` columns, the proximity accepted-guard, `{ dispatched }`
  shape, missing dispatch log, missing opt-in path, error envelope.
- **Cross-lane:** F6 inserts an emergency contact (pending) then POSTs `{ optin: { contactId } }`
  here; F6's SOS button POSTs `{ type: 'sos', location: { lat, lng } }` (CONTRACT §4). Confirm
  F6 uses these exact bodies.
- **Lane:** only `backend/**`.
