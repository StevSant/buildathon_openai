# Supabase Project Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure Pulso for the connected Supabase project and deploy its schema, seed data, Edge Functions, and required secrets without exposing credentials.

**Architecture:** Supabase MCP is the authoritative remote deployment path because it is already authenticated and the CLI is unavailable. Local configuration is split between browser-safe Next.js values and server-only Edge Function values; remote changes are applied in dependency order and verified with database introspection, function listings, test queries, and advisors.

**Tech Stack:** Supabase MCP, PostgreSQL 15 with PostGIS and RLS, Supabase Edge Functions (Deno/TypeScript), Next.js 14, PowerShell, npm workspaces.

## Global Constraints

- Preserve every unrelated uncommitted file and edit currently in the worktree.
- Never echo, commit, or place `OPENAI_API_KEY`, `CEDULA_HASH_PEPPER`, service-role keys, or Hermes credentials in frontend configuration.
- `frontend/.env.local` contains only browser-safe `NEXT_PUBLIC_*` values.
- `backend/supabase/.env.local` contains server-only local Edge Function configuration and remains ignored.
- Deploy migrations in the order `0001_init.sql`, then `0002_whatsapp_sos.sql`.
- Keep JWT verification enabled for `verify-identity`, `analyze-report`, `create-realtime-session`, and `agent-tools`.
- Keep JWT verification disabled only for `proximity-dispatcher`, whose webhook/SOS routing is intentionally implemented in the function.
- Leave Hermes and external identity-provider integrations disabled unless credentials are explicitly supplied.
- Do not create the incident webhook while Hermes is disabled.
- The available Supabase MCP surface cannot set Edge Function secrets; use the authenticated Supabase dashboard for that one operation.
- The current sandbox grants read-only access to `.git`; do not overwrite or reset user changes. Run commit commands only if Git write permission becomes available.
- If the Windows patch wrapper remains unavailable, use a native PowerShell write only for the intended file and verify the resulting diff immediately.

---

## File Map

- Modify `backend/supabase/migrations/0001_init.sql`: add ownership-preserving `WITH CHECK` predicates to update policies.
- Create `frontend/.env.local` (ignored): connected project URL, publishable key, and public UI/runtime defaults.
- Create `backend/supabase/.env.local` (ignored): OpenAI credential, generated cédula pepper, optional blank integrations, and server defaults.
- Create `frontend/lib/database.types.ts`: generated remote database types, only if the MCP output typechecks without manual semantic changes.
- Remote Supabase state: two migration records, six seed incidents, one storage bucket, five Edge Functions, and two Edge Function secrets.
- No tracked file may contain a secret.

### Task 1: Harden the Initial RLS Migration

**Files:**
- Modify: `backend/supabase/migrations/0001_init.sql`
- Inspect: `docs/superpowers/specs/2026-07-21-supabase-project-deployment-design.md`

**Interfaces:**
- Consumes: existing ownership columns `profiles.id` and `incidents.reporter_id`.
- Produces: update policies that enforce the same owner predicate before and after an update.

- [ ] **Step 1: Verify the expected insecure starting state**

Run:

```powershell
$profile = Select-String -Path backend/supabase/migrations/0001_init.sql -Pattern 'create policy "own profile - update"' -Context 0,2
$incident = Select-String -Path backend/supabase/migrations/0001_init.sql -Pattern 'create policy "incidents - update own"' -Context 0,2
$profile.Context.PostContext
$incident.Context.PostContext
```

Expected: the profile policy shows `using ((select auth.uid()) = id)`, the incident policy shows `using (reporter_id = (select auth.uid()))`, and neither policy has a `with check` clause.

- [ ] **Step 2: Add exact ownership checks**

Change the policy bodies to:

```sql
create policy "own profile - update" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "incidents - update own" on public.incidents
  for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));
```

Do not change any other migration statement.

- [ ] **Step 3: Verify the static security contract**

Run:

```powershell
$sql = Get-Content -Raw backend/supabase/migrations/0001_init.sql
if ($sql -notmatch '(?s)own profile - update.*?using.*?auth.uid.*?with check.*?auth.uid') { throw 'profiles WITH CHECK missing' }
if ($sql -notmatch '(?s)incidents - update own.*?using.*?auth.uid.*?with check.*?auth.uid') { throw 'incidents WITH CHECK missing' }
git diff --check -- backend/supabase/migrations/0001_init.sql
```

Expected: no output and exit code 0.

- [ ] **Step 4: Record the focused change**

Run when Git is writable:

```powershell
git add -- backend/supabase/migrations/0001_init.sql
git commit -m "fix(db): preserve ownership in update policies"
```

Expected: one commit containing only `0001_init.sql`. In the current sandbox, a permission error on `.git/index.lock` is an environment limitation; leave the working-tree change intact and continue.

### Task 2: Create Split Local Environment Configuration

**Files:**
- Create: `frontend/.env.local` (ignored)
- Create: `backend/supabase/.env.local` (ignored)
- Inspect: `frontend/.env.local.example`
- Inspect: `.env.example`
- Inspect: `.gitignore`

**Interfaces:**
- Consumes: MCP project URL `https://xtppgwxsqzjrxqyrqrit.supabase.co`, the active MCP publishable key, the user-provided OpenAI credential held in session, and a newly generated random pepper.
- Produces: browser configuration consumed by `frontend/lib/config.ts` and local server configuration consumed by `backend/supabase/functions/_shared/env.ts`.

- [ ] **Step 1: Confirm both targets are ignored**

Run:

```powershell
git check-ignore -v frontend/.env.local backend/supabase/.env.local
```

Expected: both paths match `.env*` in `.gitignore`.

- [ ] **Step 2: Create the browser-safe environment file**

Write exactly these variable names and public defaults to `frontend/.env.local`; use the active modern publishable key returned by MCP as the value of the existing compatibility variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xtppgwxsqzjrxqyrqrit.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_H2ol_2FP6tWr4gSEq11Pew_1dmcHEHG
NEXT_PUBLIC_MAP_STYLE_URL=https://demotiles.maplibre.org/style.json
NEXT_PUBLIC_DEFAULT_LAT=-1.05458
NEXT_PUBLIC_DEFAULT_LNG=-80.45445
NEXT_PUBLIC_DEFAULT_ZOOM=14
NEXT_PUBLIC_DEFAULT_RADIUS_METERS=3000
NEXT_PUBLIC_ALERT_SEVERITY_MIN=4
NEXT_PUBLIC_ALERT_RADIUS_METERS=500
NEXT_PUBLIC_VENUE_NAME="Cdla. Primero de Mayo"
NEXT_PUBLIC_VENUE_CITY=Portoviejo
NEXT_PUBLIC_OPENAI_REALTIME_URL=https://api.openai.com/v1/realtime
```

Before writing, call `mcp__supabase__get_publishable_keys({})` once more and confirm this publishable key is still active. If Supabase has rotated it, use the current non-disabled `sb_publishable_*` value instead.

- [ ] **Step 3: Generate the server-only environment file without displaying secrets**

Generate 32 random bytes with `System.Security.Cryptography.RandomNumberGenerator`, encode them as lowercase hexadecimal, and bind the user-provided OpenAI credential from the current secure session. Write these names to `backend/supabase/.env.local`:

```dotenv
OPENAI_API_KEY=(session credential; never print)
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_VISION_MODEL=gpt-5.6-terra
OPENAI_REALTIME_VOICE=marin
CEDULA_HASH_PEPPER=(generated 64-character lowercase hexadecimal value; never print)
IDENTITY_VERIFY_API_URL=
IDENTITY_VERIFY_API_KEY=
HERMES_API_URL=
HERMES_API_KEY=
HERMES_WHATSAPP_FROM=
WHATSAPP_PROXIMITY_TEMPLATE=pulso_proximity_alert
WHATSAPP_SOS_TEMPLATE=pulso_sos
MAX_RADIUS_METERS=10000
DEFAULT_RADIUS_METERS=3000
INCIDENT_TTL_HOURS=24
CONFIRM_THRESHOLD=3
DISPUTE_THRESHOLD=3
TRUST_VERIFIED_BONUS=10
TRUST_PER_CONFIRMED=2
TRUST_PER_DISPUTED=3
TIMEZONE=America/Guayaquil
DEFAULT_LANGUAGE=es
```

Parenthetical values are security instructions, not file contents. The implementation substitutes values in memory and must not emit the resulting file through a tool response.

- [ ] **Step 4: Verify names, boundaries, and ignore status without printing values**

Run:

```powershell
$frontNames = (Get-Content frontend/.env.local | Where-Object { $_ -match '^[A-Z_]+=' }) -replace '=.*$', ''
$serverNames = (Get-Content backend/supabase/.env.local | Where-Object { $_ -match '^[A-Z_]+=' }) -replace '=.*$', ''
if ($frontNames | Where-Object { $_ -notlike 'NEXT_PUBLIC_*' }) { throw 'Server variable found in frontend env' }
if ('OPENAI_API_KEY' -notin $serverNames) { throw 'OPENAI_API_KEY missing' }
if ('CEDULA_HASH_PEPPER' -notin $serverNames) { throw 'CEDULA_HASH_PEPPER missing' }
git check-ignore frontend/.env.local backend/supabase/.env.local
git status --short --ignored frontend/.env.local backend/supabase/.env.local
```

Expected: both files are ignored; no values are printed; frontend names all start with `NEXT_PUBLIC_`.

### Task 3: Apply and Verify the Remote Database

**Files:**
- Read: `backend/supabase/migrations/0001_init.sql`
- Read: `backend/supabase/migrations/0002_whatsapp_sos.sql`
- Read: `backend/supabase/seed.sql`
- Optional create: `frontend/lib/database.types.ts`

**Interfaces:**
- Consumes: the corrected migration SQL and idempotent seed SQL.
- Produces: remote tables, RPCs, RLS policies, PostGIS indexes, the `report-photos` bucket, six demo incidents, and MCP migration history.

- [ ] **Step 1: Reconfirm the remote precondition**

Call:

```text
mcp__supabase__list_tables({ schemas: ["public"], verbose: true })
mcp__supabase__list_migrations({})
```

Expected before first deployment: no public tables and no migrations. If state differs, stop and reconcile rather than applying blindly.

- [ ] **Step 2: Apply the initial migration**

Read `backend/supabase/migrations/0001_init.sql` in full immediately before the call, then call `mcp__supabase__apply_migration` with `name` set to `init` and `query` set byte-for-byte to that in-memory file content. This avoids duplicating or drifting the authoritative SQL in the plan.

Expected: successful migration result.

- [ ] **Step 3: Inspect state before the second migration**

Call:

```text
mcp__supabase__list_tables({ schemas: ["public"], verbose: false })
mcp__supabase__list_migrations({})
```

Expected: `profiles`, `incidents`, and `incident_confirmations` exist and one migration is recorded.

- [ ] **Step 4: Apply the WhatsApp/SOS migration**

Read `backend/supabase/migrations/0002_whatsapp_sos.sql` in full immediately before the call, then call `mcp__supabase__apply_migration` with `name` set to `whatsapp_sos` and `query` set byte-for-byte to that in-memory file content.

Expected: successful migration result.

- [ ] **Step 5: Seed demo incidents**

Call `mcp__supabase__execute_sql` with the entire current contents of `backend/supabase/seed.sql`.

Expected: successful SQL result.

- [ ] **Step 6: Verify database objects and seed counts**

Call `mcp__supabase__execute_sql` with:

```sql
select
  (select count(*) from public.incidents where reporter_id is null) as seed_incidents,
  (select count(*) from storage.buckets where id = 'report-photos') as photo_buckets,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('get_nearby_incidents', 'get_incident_details', 'confirm_incident', 'get_alert_matches')) as expected_rpcs,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relrowsecurity
       and c.relname in ('profiles', 'incidents', 'incident_confirmations', 'whatsapp_config',
                         'emergency_contacts', 'alert_rules', 'whatsapp_dispatch_log')) as rls_tables;
```

Expected: `seed_incidents = 6`, `photo_buckets = 1`, `expected_rpcs = 4`, and `rls_tables = 7`.

- [ ] **Step 7: Generate database types**

Call `mcp__supabase__generate_typescript_types({})`. If it returns valid TypeScript, save it unchanged to `frontend/lib/database.types.ts` and run:

```powershell
npm run typecheck:frontend
```

Expected: exit code 0. If the generated artifact is incompatible or malformed, do not hand-edit generated semantics; omit the file and report the generator result separately.

### Task 4: Deploy All Edge Functions

**Files:**
- Read: `backend/supabase/functions/deno.json`
- Read: `backend/supabase/functions/_shared/*.ts`
- Read: `backend/supabase/functions/verify-identity/*.ts`, `analyze-report/*.ts`, `create-realtime-session/*.ts`, `agent-tools/*.ts`, and `proximity-dispatcher/*.ts`
- Read: `backend/core/**/*.ts`
- Read: `backend/adapters/**/*.ts`

**Interfaces:**
- Consumes: five function entrypoints, their local imports, the Deno import map, and the deployed database RPCs.
- Produces: five remotely deployed Edge Functions with source-aligned JWT settings.

- [ ] **Step 1: Build a complete upload manifest**

For every deployment, include these common files under their repository-relative names:

```text
backend/supabase/functions/deno.json
backend/supabase/functions/_shared/*.ts
backend/core/**/*.ts
backend/adapters/**/*.ts
```

Add exactly one function-specific set per call:

```text
verify-identity:         backend/supabase/functions/verify-identity/index.ts
analyze-report:          backend/supabase/functions/analyze-report/index.ts
create-realtime-session: backend/supabase/functions/create-realtime-session/index.ts
                         backend/supabase/functions/create-realtime-session/personas.ts
                         backend/supabase/functions/create-realtime-session/tools.ts
agent-tools:             backend/supabase/functions/agent-tools/index.ts
proximity-dispatcher:    backend/supabase/functions/proximity-dispatcher/index.ts
```

Exclude package files, tsconfig files, environment files, tests, and unrelated function directories. Use `backend/supabase/functions/deno.json` as `import_map_path`.

Expected: every relative or `@pulso/*` import resolves inside the uploaded set.

- [ ] **Step 2: Deploy the four authenticated functions**

Call `mcp__supabase__deploy_edge_function` once per function with the exact name and entrypoint:

```text
verify-identity          backend/supabase/functions/verify-identity/index.ts       verify_jwt=true
analyze-report           backend/supabase/functions/analyze-report/index.ts        verify_jwt=true
create-realtime-session  backend/supabase/functions/create-realtime-session/index.ts verify_jwt=true
agent-tools              backend/supabase/functions/agent-tools/index.ts           verify_jwt=true
```

Expected: each call returns a deployed function version.

- [ ] **Step 3: Deploy the webhook-capable function**

Call `mcp__supabase__deploy_edge_function` for:

```text
proximity-dispatcher  backend/supabase/functions/proximity-dispatcher/index.ts  verify_jwt=false
```

Expected: deployed successfully. Do not create a database webhook while Hermes values are blank.

- [ ] **Step 4: Verify remote function metadata**

Call:

```text
mcp__supabase__list_edge_functions({})
```

Expected: exactly the five named functions are active; the four user-facing functions verify JWTs and `proximity-dispatcher` does not.

### Task 5: Configure Remote Edge Function Secrets

**Files:**
- Read without displaying values: `backend/supabase/.env.local`
- No tracked files modified.

**Interfaces:**
- Consumes: `OPENAI_API_KEY` and `CEDULA_HASH_PEPPER` from the ignored backend environment file.
- Produces: remote Supabase Edge Function secrets available to all five functions.

- [ ] **Step 1: Load browser-control guidance**

Use the `browser:control-in-app-browser` skill because Supabase MCP has no secret-management method. Reuse an authenticated Supabase dashboard session if one exists.

- [ ] **Step 2: Open the connected project’s Edge Function secrets page**

Navigate to the dashboard project reference `xtppgwxsqzjrxqyrqrit`, then open Edge Functions → Secrets.

Expected: the project reference matches MCP before any write.

- [ ] **Step 3: Add required secrets without exposing their values**

Add:

```text
OPENAI_API_KEY
CEDULA_HASH_PEPPER
OPENAI_BASE_URL
OPENAI_REALTIME_MODEL
OPENAI_VISION_MODEL
OPENAI_REALTIME_VOICE
MAX_RADIUS_METERS
DEFAULT_RADIUS_METERS
INCIDENT_TTL_HOURS
CONFIRM_THRESHOLD
DISPUTE_THRESHOLD
WHATSAPP_PROXIMITY_TEMPLATE
WHATSAPP_SOS_TEMPLATE
TIMEZONE
DEFAULT_LANGUAGE
```

Use values from `backend/supabase/.env.local`. Do not add blank Hermes or identity-provider variables. Never paste secrets into chat, SQL, browser URL parameters, or tracked files.

Expected: dashboard confirms all listed names; values remain masked.

- [ ] **Step 4: Verify secret names only**

Inspect the dashboard list and confirm `OPENAI_API_KEY` and `CEDULA_HASH_PEPPER` exist. Do not reveal, copy back, or screenshot their values.

### Task 6: End-to-End Verification and Handoff

**Files:**
- Inspect: all changed and created files.
- No new production code unless verification identifies a scoped deployment defect.

**Interfaces:**
- Consumes: completed local config, remote database, deployed functions, and remote secrets.
- Produces: evidence-backed completion report and a clean secret boundary.

- [ ] **Step 1: Run repository checks**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit 0. If the build makes a network-dependent request, distinguish that environmental failure from TypeScript or application failures.

- [ ] **Step 2: Run Supabase security and performance advisors**

Call:

```text
mcp__supabase__get_advisors({ type: "security" })
mcp__supabase__get_advisors({ type: "performance" })
```

Expected: no deployment-caused critical security finding. Resolve findings caused by these migrations before completion; report unrelated project-level recommendations with their remediation URLs.

- [ ] **Step 3: Test a public database RPC under the database owner**

Call `mcp__supabase__execute_sql` with:

```sql
select count(*) as nearby_count
from public.get_nearby_incidents(-1.05458, -80.45445, 3000, null);
```

Expected: `nearby_count` is greater than 0.

- [ ] **Step 4: Verify final remote inventory**

Call:

```text
mcp__supabase__list_migrations({})
mcp__supabase__list_tables({ schemas: ["public"], verbose: false })
mcp__supabase__list_edge_functions({})
```

Expected: two migrations, seven public tables, and five Edge Functions.

- [ ] **Step 5: Verify no secret is tracked or exposed**

Run without printing environment file contents:

```powershell
git check-ignore frontend/.env.local backend/supabase/.env.local
git ls-files frontend/.env.local backend/supabase/.env.local
git diff --check
git status --short
```

Expected: both env files are ignored, `git ls-files` returns nothing for them, and only intended tracked changes plus pre-existing unrelated user changes are shown.

- [ ] **Step 6: Commit intended tracked artifacts if permitted**

Run only when Git becomes writable:

```powershell
git add -- backend/supabase/migrations/0001_init.sql frontend/lib/database.types.ts docs/superpowers/plans/2026-07-21-supabase-project-deployment.md
git diff --cached --check
git commit -m "chore: deploy Supabase project configuration"
```

Omit `frontend/lib/database.types.ts` if Task 3 intentionally skipped generation. Expected: the commit contains no env files and no unrelated worktree changes.

- [ ] **Step 7: Report deployment evidence**

Report the project reference, migration/table/function counts, advisor status, local typecheck/build results, local env file locations, and any optional integrations left disabled. Never repeat secret values.


