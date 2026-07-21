# B6 — Anonymous Reports & Abuse Gate Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Backend (`backend/supabase/migrations/**`, `backend/core/domain/**`,
`backend/adapters/persistence/**`) **plus the agreed amendment of shared frozen files**
(`plans/CONTRACT.md`, `docs/DECISIONS.md`, `docs/DATA-MODEL.md`) — the amendment was approved
in `docs/superpowers/specs/2026-07-21-anonymous-reporting-design.md` (the design doc for this
plan; read it first).
**Goal:** Reports become anonymous to other users (no `reporter_name` anywhere past the DB),
while the server keeps the user→report link as an abuse gate: `profiles.disabled_at` +
`public.is_active_profile()` in RLS block disabled accounts from posting reports or votes,
and the unique `cedula_hash` tombstone blocks re-registration.
**Depends on:** B1 (schema/RPCs). **Blocks:** F7 (frontend consumes the amended contract).
**Reads from CONTRACT:** §2 (shared types), §3.2 (`get_incident_details`).

## Global Constraints (apply to every task)
- The DB has never been deployed → **edit migration `0001_init.sql` in place** (no `0003`).
  Local stacks re-apply with `supabase db reset`.
- Profiles are **disabled, never deleted** — the row is the `cedula_hash` tombstone that
  keeps a banned cédula from re-registering (ADR-020).
- The raw cédula is never stored or logged (unchanged, ADR-008).
- Comments/commits in English; no user-facing strings in this lane.
- `supabase` CLI commands run from the `backend/` directory.

**Scaffold reality (verified 2026-07-21):** `get_incident_details` currently returns
`reporter_name` (migration `0001_init.sql:155,167`), mirrored in
`backend/core/domain/incident-details.ts:19`,
`backend/adapters/persistence/supabase-incident-repository.ts:82`, `plans/CONTRACT.md:46`,
and `docs/DATA-MODEL.md:190,202`. `profiles` has `trust_score` but no disable mechanism, and
the `incidents`/`incident_confirmations` insert policies check only row ownership.
`get_nearby_incidents` carries **no** reporter fields — it needs no change.

---

### Task 1: Amend the frozen contract (CONTRACT §2 + §3.2)

This is the agreed H0 amendment (design doc §Decisions). Do it first so both lanes code
against the new seam.

**Files:**
- Modify: `plans/CONTRACT.md:41-46` (§2 `IncidentDetails`), `plans/CONTRACT.md:64` (§3.2 row)
- Modify: `plans/backend/B1-schema-rls-rpc-seed.md` (superseded note),
  `plans/frontend/F2-live-map.md` (superseded note)

**Interfaces:**
- Produces: contract type `IncidentDetails = Omit<NearbyIncident, 'distance_meters'> &
  { reporter_verified: boolean }` — consumed by Task 3 (domain type) and by F7.

- [ ] **Step 1: Replace the `IncidentDetails` contract type**

In `plans/CONTRACT.md` §2, replace:

```ts
// One incident's public view: everything in NearbyIncident except distance_meters
// (a single-incident lookup has no user origin to measure from), plus the reporter fields.
type IncidentDetails = Omit<NearbyIncident, 'distance_meters'> & {
  reporter_name: string | null; reporter_verified: boolean
}
```

with:

```ts
// One incident's public view: everything in NearbyIncident except distance_meters
// (a single-incident lookup has no user origin to measure from), plus reporter_verified.
// Anonymous by design (ADR-020): no reporter identity ever crosses this seam.
type IncidentDetails = Omit<NearbyIncident, 'distance_meters'> & {
  reporter_verified: boolean
}
```

- [ ] **Step 2: Update the §3.2 RPC row**

Replace the `get_incident_details` row's Returns cell:

`one `IncidentDetails` (no reporter PII beyond `display_name` + `verified`)`

with:

`one `IncidentDetails` (anonymous: no reporter identity, only `reporter_verified` — ADR-020)`

- [ ] **Step 3: Mark the superseded plans**

Directly under the H1 title of `plans/backend/B1-schema-rls-rpc-seed.md` AND of
`plans/frontend/F2-live-map.md`, add this line (do not rewrite their bodies):

```markdown
> ⚠️ **Amended by B6/F7 (2026-07-21, ADR-020):** `IncidentDetails` no longer carries
> `reporter_name` — reports are anonymous to users. Where this plan shows `reporter_name`,
> read `reporter_verified` only.
```

- [ ] **Step 4: Commit**

```bash
git add plans/CONTRACT.md plans/backend/B1-schema-rls-rpc-seed.md plans/frontend/F2-live-map.md
git commit -m "docs(contract): amend IncidentDetails to anonymous shape (ADR-020)"
```

---

### Task 2: Migration 0001 — `disabled_at`, `is_active_profile()`, hardened policies, anonymous RPC

All four edits are in `backend/supabase/migrations/0001_init.sql`.

**Files:**
- Modify: `backend/supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: `public.is_active_profile() returns boolean` (used by the two insert policies);
  `get_incident_details` without `reporter_name` (consumed by Task 3's repository and F7).

- [ ] **Step 1: Add `disabled_at` to profiles**

In the `create table public.profiles` block (~line 22), replace:

```sql
  trust_score         integer not null default 0,
  created_at          timestamptz not null default now()
```

with:

```sql
  trust_score         integer not null default 0,
  disabled_at         timestamptz,                 -- non-null → account disabled (ADR-020); rows are never deleted
  created_at          timestamptz not null default now()
```

- [ ] **Step 2: Add the `is_active_profile()` helper**

Insert between the three `alter table … enable row level security;` lines (~line 63) and the
`-- profiles: a user sees and edits ONLY their own row` comment:

```sql
-- True while the caller's profile has not been disabled (ADR-020). Users without a profile
-- row (signed up, not yet verified) count as active — disabling is an explicit act.
-- SECURITY DEFINER so insert policies can consult profiles without recursive RLS evaluation.
create or replace function public.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.disabled_at is not null
  );
$$;

revoke all on function public.is_active_profile() from public;
grant execute on function public.is_active_profile() to authenticated;
```

- [ ] **Step 3: Harden the two insert policies**

Replace:

```sql
create policy "incidents - insert own" on public.incidents
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));
```

with:

```sql
create policy "incidents - insert own" on public.incidents
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.is_active_profile());
```

and replace:

```sql
create policy "confirmations - insert own" on public.incident_confirmations
  for insert to authenticated with check (user_id = (select auth.uid()));
```

with:

```sql
create policy "confirmations - insert own" on public.incident_confirmations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active_profile());
```

(Leave `whatsapp_config` / `emergency_contacts` / `alert_rules` policies in 0002 untouched —
a disabled user keeps SOS and safety config on purpose; only public publishing is blocked.)

- [ ] **Step 4: Strip `reporter_name` from `get_incident_details`**

Replace the whole `get_incident_details` function (comment through `$$;`, ~lines 145-176) with:

```sql
-- get_incident_details — one incident, anonymous to users: no reporter identity is returned,
-- only whether the report came from a verified account (ADR-020).
create or replace function public.get_incident_details(target_id uuid)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  severity      integer,
  status        text,
  confirmations integer,
  reporter_verified boolean,
  created_at    timestamptz,
  lng           double precision,
  lat           double precision
)
language sql
security invoker
set search_path = ''
as $$
  select
    i.id, i.title, i.description, i.category, i.severity, i.status, i.confirmations,
    coalesce(p.verified, false) as reporter_verified,
    i.created_at,
    extensions.st_x(i.location::extensions.geometry) as lng,
    extensions.st_y(i.location::extensions.geometry) as lat
  from public.incidents i
  left join public.profiles p on p.id = i.reporter_id
  where i.id = target_id
  limit 1;
$$;
```

- [ ] **Step 5: Re-apply locally and verify the shapes**

Run:
```bash
cd backend && supabase db reset
```
Expected: migrations 0001 + 0002 and the seed apply without error.

Then:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.is_active_profile" \
  -c "select column_name from information_schema.columns where table_name='profiles' and column_name='disabled_at';" \
  -c "select id, reporter_verified from public.get_incident_details((select id from public.incidents limit 1));"
```
Expected: the function exists; `disabled_at` column exists; the RPC returns rows and errors
if you ask for `reporter_name` (the column is gone).

- [ ] **Step 6: Commit**

```bash
git add backend/supabase/migrations/0001_init.sql
git commit -m "feat(db): anonymous incident details + disabled_at abuse gate in RLS (ADR-020)"
```

---

### Task 3: Backend type mirrors — domain type + repository mapping

**Files:**
- Modify: `backend/core/domain/incident-details.ts`
- Modify: `backend/adapters/persistence/supabase-incident-repository.ts:82`

**Interfaces:**
- Consumes: contract shape from Task 1.
- Produces: `IncidentDetails` without `reporter_name` — imported type-only by the frontend
  (F7) and returned by `SupabaseIncidentRepository.getDetails`.

- [ ] **Step 1: Rewrite the domain type**

Replace the entire content of `backend/core/domain/incident-details.ts` with:

```ts
import type { Category } from './category';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/**
 * Row returned by `get_incident_details`: one incident, anonymous to users — the only
 * reporter-derived field is `reporter_verified` (ADR-020); never a name, cédula, or email.
 * Snake_case to match the SQL columns (see plans/CONTRACT.md §2). Mirrors NearbyIncident
 * minus `distance_meters` (a single-incident lookup has no user origin to measure from).
 */
export interface IncidentDetails {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  severity: Severity;
  status: IncidentStatus;
  confirmations: number;
  reporter_verified: boolean;
  created_at: string;
  lng: number;
  lat: number;
}
```

- [ ] **Step 2: Drop the mapping line in the repository**

In `backend/adapters/persistence/supabase-incident-repository.ts`, replace:

```ts
      confirmations: row.confirmations,
      reporter_name: row.reporter_name ?? null,
      reporter_verified: Boolean(row.reporter_verified),
```

with:

```ts
      confirmations: row.confirmations,
      reporter_verified: Boolean(row.reporter_verified),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: `backend/core` and `backend/adapters` compile clean. (The FRONTEND may fail until
F7 lands — that is expected and belongs to the other lane; this command only builds backend.)

- [ ] **Step 4: Commit**

```bash
git add backend/core/domain/incident-details.ts backend/adapters/persistence/supabase-incident-repository.ts
git commit -m "feat(core): IncidentDetails is anonymous — drop reporter_name (ADR-020)"
```

---

### Task 4: Docs — ADR-020 + DATA-MODEL sync

**Files:**
- Modify: `docs/DECISIONS.md` (append after ADR-019)
- Modify: `docs/DATA-MODEL.md:45-53` (profiles), `docs/DATA-MODEL.md:190,202`
  (`get_incident_details` mirror)

- [ ] **Step 1: Append ADR-020**

Add at the end of `docs/DECISIONS.md`:

```markdown
## ADR-020 — Reports are anonymous to users; identity kept internally as an abuse gate
**Context:** Fear of retaliation suppresses reporting: the incident sheet showed "Reportado
por {display_name}" to every user. But fully anonymous reports invite abuse — the deterrent
(disable an account so its cédula cannot re-register) needs the server-side user→report link.
**Decision:** No reporter identity is shown anywhere in the UI — only a
`Reporte verificado ✓` badge derived from the reporter's `verified` flag.
`get_incident_details` no longer returns `reporter_name`; internally `incidents.reporter_id`
stays. Abuse handling is manual for the hackathon: setting `profiles.disabled_at` blocks new
incidents and confirmations via RLS (`public.is_active_profile()`); profiles are disabled,
never deleted, so the unique `cedula_hash` tombstone blocks re-registration
([ADR-008](#adr-008--store-only-an-hmac-hash-of-the-cédula-never-the-raw-number)).
Disclaimers state the honest promise — anonymous to other users, identity used only to
prevent abuse — at signup and at report time.
**Consequences:** The retaliation fear-vector (a name on screen) is closed while moderation
stays possible. Residual risk, accepted: authenticated users can read `incidents.reporter_id`
(a bare uuid) via direct PostgREST or Realtime payloads — profiles RLS blocks mapping that
uuid to a name, and a column-level REVOKE would break Realtime `postgres_changes`
([ADR-006](#adr-006--realtime-via-postgres-changes-not-broadcast-for-the-mvp)). P1 hardening
path: switch the map channel to broadcast-from-database and revoke direct selects.
```

- [ ] **Step 2: Sync DATA-MODEL.md**

Apply the same three edits as the migration:
1. In the profiles block (line ~51), add below `trust_score`:
   `  disabled_at         timestamptz,                 -- non-null → account disabled (ADR-020); rows are never deleted`
2. Line ~190: delete the row `  reporter_name text,        -- display_name only; never cédula/email`
3. Line ~202: delete the line `    p.display_name as reporter_name,`

- [ ] **Step 3: Commit**

```bash
git add docs/DECISIONS.md docs/DATA-MODEL.md
git commit -m "docs: ADR-020 anonymous reports + abuse gate; sync DATA-MODEL"
```

---

### Task 5: Verify the abuse gate end-to-end (local stack)

**Files:** none (verification only).

- [ ] **Step 1: Start the stack and create a verified user**

Run (from `backend/`, anon key printed by `supabase start`):
```bash
cd backend && supabase start
ANON="<anon key from supabase start>"
TOKEN=$(curl -s "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"email":"anon-test@pulso.ec","password":"pulso1234"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
```

- [ ] **Step 2: Insert an incident as that user (active profile → allowed)**

```bash
curl -s "http://127.0.0.1:54321/rest/v1/incidents" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"reporter_id":"'$(python -c "import base64,json,sys;print(json.loads(base64.urlsafe_b64decode('$TOKEN'.split('.')[1]+'==').decode())['sub'])")'","title":"prueba anonimato","category":"other","severity":2,"location":"SRID=4326;POINT(-80.45445 -1.05458)"}'
```
Expected: 201 with the new row.

- [ ] **Step 3: Details RPC is anonymous**

```bash
curl -s "http://127.0.0.1:54321/rest/v1/rpc/get_incident_details" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"target_id":"<id from step 2>"}'
```
Expected: JSON with `reporter_verified` and **no** `reporter_name` key.

- [ ] **Step 4: Disable the account → inserts blocked**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "insert into public.profiles (id, disabled_at) values ('<uid>', now()) on conflict (id) do update set disabled_at = now();"
```
Re-run Step 2's curl. Expected: HTTP 403 with code `42501`
("new row violates row-level security policy").

- [ ] **Step 5: Re-enable → inserts work again**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "update public.profiles set disabled_at = null where id = '<uid>';"
```
Re-run Step 2's curl. Expected: 201 again.

- [ ] **Step 6: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(db): abuse gate verified end-to-end (anonymous RPC, disable blocks, re-enable restores)"
```

---

## Self-review notes
- **Coverage vs design doc:** anonymity model (RPC + type mirrors) ✓; manual disable +
  RLS block on incidents AND confirmations ✓; disable-not-delete tombstone ✓; ADR-020 with
  residual `reporter_id`-uuid risk ✓; CONTRACT amendment ✓. Disclaimers/UI copy → F7.
- **Contract:** `IncidentDetails` = `Omit<NearbyIncident,'distance_meters'> &
  { reporter_verified: boolean }` used identically in Tasks 1, 2 (SQL), and 3 (TS).
- **Lane:** backend dirs + the explicitly-agreed frozen files only. `get_nearby_incidents`
  untouched (already anonymous). SOS/safety tables untouched on purpose.
- **Security:** no new PII; helper is `security definer` with pinned empty search_path and
  execute granted to `authenticated` only.
