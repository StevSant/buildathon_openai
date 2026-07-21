# Audit Security Fixes Design

**Date:** 2026-07-21

## Goal

Resolve the six confirmed audit blockers without expanding Pulso's product scope: invalid
identity responses, client-writable trust/state, broken community voting, unauthenticated
service-role dispatch, abort-on-first-message failure, and unguarded authenticated routes.

## Current-state evidence

- The linked Supabase project has no remote migrations or public tables, so the checked-in
  source migrations are safe to correct before first deployment.
- The repository has no test framework. Node 24 is available, so regression tests will use
  `node:test` and TypeScript type stripping without adding dependencies.
- Supabase CLI is not installed locally. Database behavior will be covered by executable SQL
  regression tests for a future local stack plus source-contract tests that run now.
- Existing unrelated working-tree changes must be preserved and included only when they belong
  to the recovered audit/documentation work.

## Architecture

### 1. Identity verification is fail-closed at both boundaries

`verify-identity` will translate `{ verified: false, reason }` from the core use-case into an
HTTP `422` `{ error }` response. The frontend will also parse every successful response and
require `verified === true`; this protects the signup flow against older or proxied handlers
that still return HTTP 200 for an invalid identity.

The frontend parsing rule will live in a small pure module so it can be regression-tested
without rendering React.

### 2. Database writes follow least privilege

The initial migrations will explicitly grant the Data API privileges used by the application
and revoke everything else. This also makes the project compatible with Supabase's 2026 change
that no longer guarantees automatic exposure of new tables.

- `profiles`: authenticated clients may select their own row and update only `display_name`
  through RLS and column privileges. Identity/trust fields remain service-role-owned.
- `incidents`: authenticated clients may select active rows and insert reports as themselves,
  but may not directly update or delete incidents. Status and confirmation counts are RPC-owned.
- `incident_confirmations`: no direct client table access; voting is available only through
  `confirm_incident`.
- Safety tables keep only the select/insert/update privileges their owner-scoped RLS policies
  require. Dispatch logs remain server-only.
- Public RPC execute privileges are revoked from `PUBLIC` and `anon`, then granted explicitly
  to `authenticated` where the application needs them.

The owner-scoped profile `UPDATE` policy keeps its `WITH CHECK` clause as defense in depth;
column privileges reduce the client-writable surface to `display_name`.

### 3. Community voting uses a narrow privileged transaction

`public.confirm_incident` must see all votes and update an incident regardless of who reported
it, which ordinary invoker RLS cannot do. It will therefore be `SECURITY DEFINER`, with:

- `set search_path = ''`;
- an explicit non-null `auth.uid()` check;
- strict `kind` and positive-threshold validation;
- a target-incident row lock to serialize concurrent recounts;
- a clear error when the incident does not exist;
- execute revoked from `PUBLIC` and `anon`, granted only to `authenticated`.

The function exposes no arbitrary identifiers or SQL and always records the vote for
`auth.uid()`, keeping the privileged surface limited to the single community-voting operation.

### 4. Dispatcher authenticates each entry path

`proximity-dispatcher` remains `verify_jwt = false` because it accepts both database webhooks
and user SOS requests. The handler itself will enforce mutually exclusive authentication:

- `{ type: "sos", ... }`: validate the caller with the supplied user JWT and derive `userId`
  from Supabase Auth.
- Database incident payload: require `x-pulso-webhook-secret` to match the server-only
  `PROXIMITY_WEBHOOK_SECRET` using a constant-time comparison.

Only `POST` and `OPTIONS` are accepted. Missing configuration fails closed, malformed incident
identifiers are rejected, and the service client is created only after the relevant caller is
authenticated.

### 5. Message fan-out isolates recipient failures

The core dispatcher will keep sequential sends to avoid an uncontrolled burst, but each
contact send will have its own `try/catch`. Successful sends increment `sent`; failures append
a non-sensitive `{ id: contact.id, status: "failed" }` result and increment `failed`. One Hermes
failure therefore cannot prevent later accepted contacts from being attempted.

The HTTP response continues returning `{ dispatched: sent }`, preserving the frozen public
contract.

### 6. Authenticated routes have a client session gate

A focused `AuthGuard` client component will wrap the `(app)` layout. It checks the initial
Supabase session, subscribes to auth changes, redirects unauthenticated users to `/auth`, and
shows a neutral loading state until the decision is known. RLS and Edge Function authorization
remain the security boundaries; this guard prevents protected UI flashes and accidental access
to authenticated screens.

No new SSR auth dependency is introduced for this mobile-first client application.

## Testing

All production behavior begins with a failing regression test:

- identity response parser rejects `verified: false` even on HTTP 200;
- webhook authentication rejects missing/wrong secrets and accepts the configured secret;
- dispatch continues after one gateway exception and reports accurate sent/failed counts;
- auth-state helper routes missing sessions to `/auth`;
- SQL source-contract tests require explicit table/function grants, protected-column revokes,
  the restricted `SECURITY DEFINER` function, caller validation, and incident locking.

The final verification gate is:

1. regression tests;
2. frontend lint;
3. workspace typecheck;
4. optimized Next.js production build with verification-only public environment values;
5. `git diff --check` and review of staged paths;
6. one local commit, with no push or deployment.

## Error and compatibility behavior

- Invalid cédula: HTTP 422 and Spanish error shown; signup does not navigate into the app.
- Missing/invalid webhook secret: HTTP 401 without creating a service client or sending.
- Missing server secret: HTTP 500-style configuration error, with no privileged work.
- Individual Hermes failure: remaining contacts are attempted; only successful deliveries count
  as dispatched.
- Missing session: authenticated UI is not rendered and navigation moves to `/auth`.

## Out of scope

- Deploying migrations or Edge Functions to Supabase.
- Replacing Hermes with the future webhook adapter described in the integration plan.
- Adding SSR cookie authentication or a new test framework.
- Fixing unrelated audit observations that were not among the six confirmed blockers.
