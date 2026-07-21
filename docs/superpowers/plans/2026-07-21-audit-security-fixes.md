# Audit Security Fixes Implementation Plan

**Status:** Completed and verified on 2026-07-21. The steps below preserve the TDD execution
record; final SQL uses stricter column-level grants where those supersede illustrative snippets.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the six confirmed audit blockers and commit the verified repository state once, without pushing or deploying.

**Architecture:** Fail closed at HTTP/UI boundaries, reduce Data API privileges to the exact client operations Pulso uses, and keep privileged database/Edge work behind narrowly authenticated operations. Pure parsing/auth helpers and the core dispatcher are covered with Node's built-in test runner; SQL security requirements are covered by source-contract tests because no local Supabase CLI/database is installed.

**Tech Stack:** TypeScript, Node 24 `node:test`, Next.js 14, Supabase Edge Functions, PostgreSQL 15/RLS.

## Global Constraints

- Preserve unrelated working-tree changes; stage only recovered audit/docs work and this implementation.
- Create one final local commit only; do not push, deploy, or mutate the empty linked Supabase project.
- Add no npm dependencies.
- Keep `proximity-dispatcher` public contract `{ dispatched: number }` and SOS body `{ type: "sos", location: { lat, lng } }`.
- Never expose service-role keys or webhook secrets to `NEXT_PUBLIC_*` configuration.

---

### Task 1: Establish the regression-test harness and fix invalid identity handling

**Files:**
- Modify: `package.json`
- Create: `tests/identity-verification.test.mjs`
- Create: `frontend/lib/identity-verification.ts`
- Modify: `frontend/lib/index.ts`
- Modify: `frontend/components/AuthForm.tsx`
- Modify: `backend/supabase/functions/verify-identity/index.ts`

**Interfaces:**
- Produces: `readVerifiedIdentityResponse(response: Response): Promise<void>`; resolves only for HTTP success with `{ verified: true }`.
- Changes invalid identity handler response to HTTP 422 `{ error: string }`.

- [ ] **Step 1: Add the test command and failing identity tests**

Add `"test": "node --test tests"` to root scripts. Write tests using a real `Response`:

```js
test("rejects an HTTP 200 identity denial", async () => {
  const response = Response.json({ verified: false, reason: "Cédula inválida" });
  await assert.rejects(() => readVerifiedIdentityResponse(response), /Cédula inválida/);
});

test("accepts only an explicitly verified identity", async () => {
  await readVerifiedIdentityResponse(Response.json({ verified: true }));
});
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `frontend/lib/identity-verification.ts` does not exist.

- [ ] **Step 3: Implement the pure parser and use it in the form**

```ts
export async function readVerifiedIdentityResponse(response: Response): Promise<void> {
  const body = (await response.json().catch(() => ({}))) as {
    verified?: boolean;
    error?: string;
    reason?: string;
  };
  if (!response.ok || body.verified !== true) {
    throw new Error(body.error ?? body.reason ?? "No pudimos verificar tu cédula");
  }
}
```

Export it through `frontend/lib/index.ts` and replace the form's `res.ok`-only block with
`await readVerifiedIdentityResponse(res)`.

- [ ] **Step 4: Make the Edge Function return 422 for denial**

Immediately after the use-case call:

```ts
if (!result.verified) {
  return Response.json(
    { error: result.reason ?? "Cédula inválida" },
    { status: 422, headers: corsHeaders },
  );
}
```

- [ ] **Step 5: Run GREEN**

Run: `npm test`

Expected: both identity tests PASS.

---

### Task 2: Harden table privileges and repair community voting

**Files:**
- Create: `tests/database-security-contract.test.mjs`
- Modify: `backend/supabase/migrations/0001_init.sql`
- Modify: `backend/supabase/migrations/0002_whatsapp_sos.sql`
- Modify: `backend/adapters/persistence/supabase-incident-repository.ts`

**Interfaces:**
- `public.confirm_incident(uuid,text,integer,integer)` remains the RPC signature.
- Direct authenticated writes are limited to incident insert and owner-scoped safety settings.

- [ ] **Step 1: Write failing SQL source-contract tests**

Read both migration files and assert normalized SQL contains:

```js
assert.match(init, /revoke insert, update, delete on public\.profiles from authenticated/);
assert.match(init, /revoke update, delete on public\.incidents from authenticated/);
assert.match(init, /security definer/);
assert.match(init, /for update/);
assert.match(init, /revoke all on function public\.confirm_incident/);
assert.match(init, /grant execute on function public\.confirm_incident.*to authenticated/);
assert.match(safety, /revoke all on public\.whatsapp_dispatch_log from anon, authenticated/);
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: database security contract test FAILS on missing revokes/grants and invoker voting.

- [ ] **Step 3: Restrict base-table privileges in `0001_init.sql`**

After policies, add explicit privileges:

```sql
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

revoke all on public.incidents from anon, authenticated;
grant select, insert on public.incidents to authenticated;

revoke all on public.incident_confirmations from anon, authenticated;
```

Drop the profile insert policy, retain the owner-scoped profile update policy, and grant update
only on `display_name`. Retain the profile select policy and the incident insert policy. Remove
direct incident-update policies because status and confirmation counts are RPC-owned.

- [ ] **Step 4: Replace `confirm_incident` with a restricted privileged transaction**

Use `security definer`, validate `auth.uid()`, `kind`, and positive thresholds, then lock the
target incident before upsert/recount:

```sql
perform 1 from public.incidents i where i.id = target_id for update;
if not found then raise exception 'incident not found'; end if;
```

After the function:

```sql
revoke all on function public.confirm_incident(uuid, text, integer, integer) from public, anon;
grant execute on function public.confirm_incident(uuid, text, integer, integer) to authenticated;
```

Also revoke default execution from `PUBLIC`/`anon` and grant authenticated execution for
`get_nearby_incidents` and `get_incident_details`.

- [ ] **Step 5: Add least-privilege safety-table grants in `0002_whatsapp_sos.sql`**

```sql
revoke all on public.whatsapp_config, public.emergency_contacts, public.alert_rules,
  public.whatsapp_dispatch_log from anon, authenticated;
grant select, insert, update on public.whatsapp_config, public.emergency_contacts,
  public.alert_rules to authenticated;
grant select on public.whatsapp_dispatch_log to authenticated;
revoke all on function public.get_alert_matches(uuid) from public, anon, authenticated;
```

`get_alert_matches` remains service-role-only.

- [ ] **Step 6: Correct the repository comment**

Change the `confirm()` comment from `security invoker` to the restricted privileged RPC model;
the caller identity is still derived from `auth.uid()` and never passed as an argument.

- [ ] **Step 7: Run GREEN**

Run: `npm test`

Expected: identity and SQL security tests PASS.

---

### Task 3: Authenticate proximity webhooks before service-role work

**Files:**
- Create: `tests/webhook-auth.test.mjs`
- Create: `backend/supabase/functions/_shared/webhook-auth.ts`
- Modify: `backend/supabase/functions/_shared/env.ts`
- Modify: `backend/supabase/functions/proximity-dispatcher/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `hasValidWebhookSecret(req: Request, expected: string): boolean`.
- Consumes header: `x-pulso-webhook-secret`.
- Consumes server secret: `PROXIMITY_WEBHOOK_SECRET`.

- [ ] **Step 1: Write failing webhook-auth tests**

```js
test("rejects missing and incorrect webhook secrets", () => {
  assert.equal(hasValidWebhookSecret(new Request("https://pulso.test"), "correct"), false);
  assert.equal(hasValidWebhookSecret(requestWith("wrong"), "correct"), false);
});

test("accepts the configured webhook secret", () => {
  assert.equal(hasValidWebhookSecret(requestWith("correct"), "correct"), true);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `_shared/webhook-auth.ts` does not exist.

- [ ] **Step 3: Implement constant-time comparison**

Encode both strings with `TextEncoder`, reject unequal lengths, XOR every byte, and return true
only when the accumulator is zero. Never log either value.

- [ ] **Step 4: Enforce method and per-path authentication**

In the handler:

1. allow `OPTIONS`;
2. return 405 for non-POST;
3. parse body;
4. for SOS, authenticate with `createUserClient(req).auth.getUser()`;
5. otherwise, require configured `PROXIMITY_WEBHOOK_SECRET` and the matching header;
6. create the service client and Hermes gateway only after authentication;
7. validate the incident id against a UUID pattern before dispatch.

Return 401 for missing/wrong caller credentials and 500 for missing server configuration.

- [ ] **Step 5: Run GREEN**

Run: `npm test`

Expected: webhook helper tests PASS.

---

### Task 4: Continue fan-out after individual messaging failures

**Files:**
- Create: `tests/dispatch-proximity-alerts.test.mjs`
- Modify: `backend/core/use-cases/dispatch-proximity-alerts.ts`

**Interfaces:**
- Dispatcher result becomes `{ sent: number, failed: number, results: Array<{id,status}> }`.
- Edge response remains `{ dispatched: sent }`.

- [ ] **Step 1: Write a failing real-use-case test**

Use three accepted contacts and a fake gateway that throws only for the second. Assert all three
numbers were attempted, `sent === 2`, `failed === 1`, and the failed result uses the contact id
with status `failed`.

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because the second exception aborts the loop.

- [ ] **Step 3: Catch each send independently**

Wrap only `messaging.sendWhatsApp(...)` in `try/catch`. Append successful gateway results;
append `{ id: contact.id, status: "failed" }` on failure. Derive counters from result status,
counting only non-failed results as sent.

- [ ] **Step 4: Run GREEN**

Run: `npm test`

Expected: all dispatcher assertions PASS.

---

### Task 5: Guard authenticated application routes

**Files:**
- Create: `tests/auth-state.test.mjs`
- Create: `frontend/lib/auth-state.ts`
- Create: `frontend/components/AuthGuard.tsx`
- Modify: `frontend/lib/index.ts`
- Modify: `frontend/components/index.ts`
- Modify: `frontend/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `authDestination(session): "/auth" | null`.
- Produces: `<AuthGuard>{children}</AuthGuard>`.

- [ ] **Step 1: Write failing auth-state tests**

```js
assert.equal(authDestination(null), "/auth");
assert.equal(authDestination({ user: { id: "user-1" } }), null);
```

- [ ] **Step 2: Run RED**

Run: `npm test`

Expected: FAIL because `frontend/lib/auth-state.ts` does not exist.

- [ ] **Step 3: Implement helper and client guard**

The guard calls `supabase.auth.getSession()` once, subscribes with `onAuthStateChange`, redirects
when `authDestination` returns `/auth`, unsubscribes on cleanup, and renders an accessible
Spanish loading state until an authenticated session is known.

- [ ] **Step 4: Wrap `(app)/layout.tsx`**

Place the existing app shell inside `<AuthGuard>`, preserving the persistent tab bar only for an
authenticated session.

- [ ] **Step 5: Run GREEN**

Run: `npm test`

Expected: all regression tests PASS.

---

### Task 6: Align active documentation with the implemented security behavior

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `plans/CONTRACT.md`
- Modify: `plans/backend/B1-schema-rls-rpc-seed.md`
- Modify: `plans/integrations/C1-hermes-chat-integration.md`

**Interfaces:** Documentation only; no public API changes beyond the already-specified 422 and
webhook-secret behavior.

- [ ] **Step 1: Update identity, RPC, privilege, and webhook text**

Document HTTP 422 for invalid identity, server-owned trust/status fields, restricted
`confirm_incident`, `x-pulso-webhook-secret`, and per-contact failure isolation.

- [ ] **Step 2: Run consistency searches**

Run `rg` for claims that profiles/incidents are client-updatable, `security invoker` on
`confirm_incident`, or unauthenticated webhook instructions. Expected: no contradictory active
documentation remains.

---

### Task 7: Verify, review, and create the single commit

**Files:** All scoped changes from Tasks 1-6 plus the recovered audit/documentation changes
already present in the working tree. Leave unrelated deployment-plan artifacts untracked.

- [ ] **Step 1: Run the complete regression suite**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Run static verification**

Run:

```bash
npm run lint --workspace @pulso/web
npm run typecheck
git diff --check
```

Expected: all exit 0; Git may emit only Windows CRLF advisories.

- [ ] **Step 3: Run production build**

Set verification-only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_MAP_STYLE_URL`, then run `npm run build` outside the sandbox so Next workers can
spawn. Expected: optimized production build succeeds.

- [ ] **Step 4: Review and stage exact paths**

Inspect `git diff`, `git status --short`, and `git diff --cached --check`. Do not stage the
unrelated `docs/superpowers/plans/2026-07-21-supabase-project-deployment.md` artifact.

- [ ] **Step 5: Commit once**

```bash
git commit -m "fix: harden identity, voting, and alert dispatch"
```

- [ ] **Step 6: Verify the commit**

Run `git show --stat --oneline HEAD` and `git status --short`. Confirm the scoped files are in the
commit, unrelated artifacts remain untouched, and nothing was pushed.
