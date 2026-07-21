# B1 — Schema, RLS, RPC & Seed Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Backend (`backend/supabase/**`, and — for the H0 contract decisions only — `backend/core/domain/**`
and `plans/CONTRACT.md`).
**Goal:** Stand up the Postgres schema, RLS, RPCs, storage and demo seed locally, and land the
two frozen-contract fixes (H0-A: coordinates in the map RPCs; H0-B: snake_case domain types)
plus the one missing table (`whatsapp_dispatch_log`) so every other plan codes against a
correct, consistent contract.
**Depends on:** nothing. **This is the "do first" plan** — B2–B5 and every frontend plan assume
its output. Run it before anything else.
**Reads from CONTRACT:** §1 (lane ownership), §2 (shared types — this plan EDITS it), §3.2 (RPCs).

## Global Constraints (apply to every task)
- No hardcoded URLs / keys / thresholds — everything via env. DB objects use no secrets.
- One object per concern; SQL grouped by the section comments already in the migrations.
- UI copy in Spanish; code comments, commit messages, this doc → English.
- Commit convention: Conventional Commits in English.
- Supabase conventions (already used in the repo): PostGIS in the `extensions` schema; RPCs are
  `language sql`/`plpgsql` + `security invoker` + `set search_path = ''`; RLS uses
  `(select auth.uid())`.

**Scaffold reality (verified before writing this plan):**
- `backend/supabase/migrations/0001_init.sql` and `0002_whatsapp_sos.sql` already exist and are largely
  complete. `backend/supabase/seed.sql` already seeds 6 incidents around the default center.
- `backend/core/domain/incident-details.ts` is **already** snake_case and already declares `lng`/`lat`.
- `backend/core/domain/nearby-incident.ts` is **camelCase** (`distanceMeters`, `createdAt`) and lacks
  `lng`/`lat` — the outlier this plan fixes.
- Neither `get_nearby_incidents` nor `get_incident_details` currently returns coordinates.
- **RPC name mismatch (real bug):** `0002` defines `get_users_to_alert(target_incident_id uuid)`
  returning `(user_id, contact_name, contact_phone_e164, distance_meters)`, but the code that
  actually calls it — `SupabaseIncidentRepository.findAlertRecipients` — calls
  **`get_alert_matches(target_incident)`** and reads **`(user_id, contact_id, phone_e164)`**. The
  RPC the code needs does not exist. Task 4 replaces `get_users_to_alert` with `get_alert_matches`
  at the shape the code expects (keeping the migration's `profiles.last_location` proximity source).
- `0002` is **missing `whatsapp_dispatch_log`** (DATA-MODEL §9 specifies it; B5 needs it).

**FRs covered:** FR-3 (cédula uniqueness by hash — column), FR-4 (no raw cédula — column),
FR-9/FR-11 (active-incident query + expiry), FR-20/FR-21 (confirm/dispute RPC). Enables the map
(F2), report (F3), agent tools (B4), and the dispatcher (B5).

---

### Task 1: Bring up local Supabase and apply the existing migrations

**Files:**
- Read-only: `backend/supabase/config.toml`, `backend/supabase/migrations/0001_init.sql`, `backend/supabase/migrations/0002_whatsapp_sos.sql`

**Interfaces:**
- Produces: a running local stack (API :54321, DB :54322, Studio :54323) with the current schema applied.

- [ ] **Step 1: Start the local stack**

Run: `(cd backend && supabase start)`
Expected: prints the API URL, DB URL, Studio URL, anon key and service_role key. Docker must be running.

- [ ] **Step 2: Apply a clean migration + seed run**

Run: `(cd backend && supabase db reset)`
Expected: applies `0001_init.sql` then `0002_whatsapp_sos.sql`, then loads `backend/supabase/seed.sql`,
ending with `Finished supabase db reset.` and no errors.

- [ ] **Step 3: Sanity-check the objects exist**

Run:
```bash
(cd backend && supabase db reset) >/dev/null 2>&1
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*"
```
Expected: lists `profiles`, `incidents`, `incident_confirmations`, `whatsapp_config`,
`emergency_contacts`, `alert_rules`. (`whatsapp_dispatch_log` is added in Task 4.)

- [ ] **Step 4: Commit** (no file change — skip if nothing to commit; this task is a gate)

No commit; proceed once the reset is clean.

---

### Task 2: H0-A — return coordinates from both incident RPCs

The map (`IncidentMap`) renders a pin per incident from `lng`/`lat`. The two read RPCs must
expose them. A `geography(point)` is cast to `geometry` so `st_x`/`st_y` yield lng/lat.

**Files:**
- Modify: `backend/supabase/migrations/0001_init.sql` (the `get_nearby_incidents` and `get_incident_details` bodies)

**Interfaces:**
- Produces: `get_nearby_incidents(...) returns table (… lng double precision, lat double precision)`
  and `get_incident_details(target_id) returns table (… lng double precision, lat double precision)`.
- Consumed by: F2 (`lib/incidents.ts`, `IncidentMap`, `IncidentDetailSheet`), B4 (`agent-tools`).

> Rationale for editing `0001` in place rather than adding a migration: the repo is not deployed
> and not yet under git, so there is no applied history to preserve. `(cd backend && supabase db reset)` re-runs
> `0001` from scratch. Editing in place keeps the migration set minimal and readable.

- [ ] **Step 1: Add `lng`/`lat` to `get_nearby_incidents`**

In `0001_init.sql`, replace the `get_nearby_incidents` function with this exact body (adds two
columns to the `returns table` and two expressions to the `select`):

```sql
create or replace function public.get_nearby_incidents(
  user_lat      double precision,
  user_long     double precision,
  radius_meters integer default 3000,
  filter_category text default null
)
returns table (
  id             uuid,
  title          text,
  description    text,
  category       text,
  severity       integer,
  status         text,
  distance_meters double precision,
  confirmations  integer,
  created_at     timestamptz,
  lng            double precision,
  lat            double precision
)
language sql
security invoker
set search_path = ''
as $$
  select
    i.id, i.title, i.description, i.category, i.severity, i.status,
    extensions.st_distance(
      i.location,
      extensions.st_point(user_long, user_lat)::extensions.geography
    ) as distance_meters,
    i.confirmations,
    i.created_at,
    extensions.st_x(i.location::extensions.geometry) as lng,
    extensions.st_y(i.location::extensions.geometry) as lat
  from public.incidents i
  where i.status in ('provisional','confirmed','disputed')
    and (i.expires_at is null or i.expires_at > now())
    and (filter_category is null or i.category = filter_category)
    and extensions.st_dwithin(
      i.location,
      extensions.st_point(user_long, user_lat)::extensions.geography,
      radius_meters
    )
  order by distance_meters asc
  limit 20;
$$;
```

- [ ] **Step 2: Add `lng`/`lat` to `get_incident_details`**

`backend/core/domain/incident-details.ts` already declares `lng`/`lat`, so the RPC must supply them.
Replace the `get_incident_details` function with:

```sql
create or replace function public.get_incident_details(target_id uuid)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  severity      integer,
  status        text,
  confirmations integer,
  reporter_name text,
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
    p.display_name as reporter_name,
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

- [ ] **Step 3: Re-apply and verify the columns appear**

Run:
```bash
(cd backend && supabase db reset) >/dev/null 2>&1
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select id, lng, lat, distance_meters from public.get_nearby_incidents(-1.05458, -80.45445, 3000, null) limit 3;"
```
Expected: 3 rows, each with non-null `lng` (~-80.45) and `lat` (~-1.05) and a `distance_meters`.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/0001_init.sql
git commit -m "feat(db): return lng/lat from incident read RPCs so the map can render pins"
```

---

### Task 3: H0-B — align the domain types to the snake_case RPC rows + coordinates

The frontend casts RPC rows straight to these types (`as NearbyIncident[]`), so the type must
match the row shape exactly. `incident-details.ts` is already correct; fix `nearby-incident.ts`
and update the frozen contract to match.

**Files:**
- Modify: `backend/core/domain/nearby-incident.ts`
- Verify (no change expected): `backend/core/domain/incident-details.ts`
- Modify: `plans/CONTRACT.md` (§2 shared type contract)

**Interfaces:**
- Produces: `NearbyIncident` with `distance_meters`, `created_at`, `lng`, `lat` (snake_case);
  `IncidentDetails` unchanged (already snake_case + lng/lat).
- Consumed by: every frontend plan importing `import type { NearbyIncident, IncidentDetails } from '@pulso/core'`.

- [ ] **Step 1: Rewrite `backend/core/domain/nearby-incident.ts`**

```ts
import type { Category } from './category';
import type { IncidentStatus } from './incident-status';
import type { Severity } from './severity';

/**
 * Row returned by the `get_nearby_incidents` RPC: incident + distance + coordinates, no PII.
 * Snake_case to match the SQL columns exactly, so the browser client can cast rows directly
 * (see plans/CONTRACT.md §2).
 */
export interface NearbyIncident {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  severity: Severity;
  status: IncidentStatus;
  distance_meters: number;
  confirmations: number;
  created_at: string;
  lng: number;
  lat: number;
}
```

- [ ] **Step 2: Confirm `backend/core/domain/incident-details.ts` already matches**

Open it and confirm it declares snake_case fields plus `lng: number; lat: number`. It does — no
edit needed. (If a future drift removes them, restore to: `id, title, description, category,
severity, status, confirmations, reporter_name, reporter_verified, created_at, lng, lat`.)

- [ ] **Step 3: Update `plans/CONTRACT.md` §2 to the true shapes**

Replace the type block in CONTRACT §2 with:

```ts
type Category = 'road_closure' | 'accident' | 'flood' | 'fire' | 'public_event' | 'other'
type IncidentStatus = 'provisional' | 'confirmed' | 'disputed' | 'resolved'
type VerificationMethod = 'registry' | 'algorithmic'
type Severity = 1 | 2 | 3 | 4 | 5

type NearbyIncident = {
  id: string; title: string; description: string | null; category: Category
  severity: Severity; status: IncidentStatus; distance_meters: number
  confirmations: number; created_at: string; lng: number; lat: number
}
// IncidentDetails is a single-incident lookup: no distance_meters, plus reporter fields.
type IncidentDetails = {
  id: string; title: string; description: string | null; category: Category
  severity: Severity; status: IncidentStatus; confirmations: number
  reporter_name: string | null; reporter_verified: boolean
  created_at: string; lng: number; lat: number
}
```

- [ ] **Step 4: Typecheck the workspace**

Run: `npm run typecheck`
Expected: `core` and `adapters` compile with no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/core/domain/nearby-incident.ts plans/CONTRACT.md
git commit -m "fix(core): align NearbyIncident to snake_case RPC rows + lng/lat (frozen-contract H0-B)"
```

---

### Task 4: Add `whatsapp_dispatch_log` + align the proximity RPC to `get_alert_matches`

Two `0002` gaps: (a) DATA-MODEL §9 specifies `whatsapp_dispatch_log` but it was never created —
B5 logs each send here and relies on `unique (incident_id, contact_id)` for idempotency; (b) the
code (`SupabaseIncidentRepository.findAlertRecipients`) calls `get_alert_matches(target_incident)`
returning `(user_id, contact_id, phone_e164)`, but `0002` defines a differently-named/shaped
`get_users_to_alert`. Replace it so the DB provides exactly what the code calls.

**Files:**
- Modify: `backend/supabase/migrations/0002_whatsapp_sos.sql` (append the table + its RLS; replace the RPC)

**Interfaces:**
- Produces: `public.whatsapp_dispatch_log(id, incident_id, contact_id, status, created_at)`
  with `status in ('queued','sent','failed')` and `unique (incident_id, contact_id)`; and
  `public.get_alert_matches(target_incident uuid) returns table (user_id uuid, contact_id uuid, phone_e164 text)`.
- Consumed by: B5 — `findAlertRecipients` calls `get_alert_matches`; `dispatch-proximity-alerts` logs sends.

- [ ] **Step 1: Append the table and RLS to `0002_whatsapp_sos.sql`**

Add at the end of the file:

```sql
-- ============================================================================
-- whatsapp_dispatch_log — idempotency + audit for outbound sends
-- ============================================================================
create table public.whatsapp_dispatch_log (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents (id) on delete set null,
  contact_id  uuid references public.emergency_contacts (id) on delete set null,
  status      text not null default 'queued'
                check (status in ('queued','sent','failed')),
  created_at  timestamptz not null default now(),
  unique (incident_id, contact_id)   -- send at most once per incident per contact
);

alter table public.whatsapp_dispatch_log enable row level security;

-- writes are service-role only (dispatcher bypasses RLS); a user may read logs for their own contacts
create policy "dispatch_log - read own" on public.whatsapp_dispatch_log
  for select to authenticated
  using (exists (
    select 1 from public.emergency_contacts ec
    where ec.id = whatsapp_dispatch_log.contact_id
      and ec.owner_id = (select auth.uid())
  ));
```

- [ ] **Step 2: Replace `get_users_to_alert` with `get_alert_matches`**

In `0002_whatsapp_sos.sql`, replace the `get_users_to_alert` function definition with the RPC the
code actually calls (same `profiles.last_location` proximity source, but the shape
`findAlertRecipients` reads):

```sql
drop function if exists public.get_users_to_alert(uuid);

create or replace function public.get_alert_matches(target_incident uuid)
returns table (
  user_id    uuid,
  contact_id uuid,
  phone_e164 text
)
language sql
security invoker
set search_path = ''
as $$
  select r.user_id, ec.id as contact_id, ec.phone_e164
  from public.incidents inc
  join public.alert_rules r        on r.enabled = true
  join public.profiles pr          on pr.id = r.user_id
  join public.whatsapp_config wc   on wc.user_id = r.user_id and wc.enabled = true
  join public.emergency_contacts ec
       on ec.owner_id = r.user_id and ec.opt_in_status = 'accepted'
  where inc.id = target_incident
    and pr.last_location is not null
    and inc.severity >= r.min_severity
    and extensions.st_dwithin(inc.location, pr.last_location, r.radius_meters)
    and pr.id is distinct from inc.reporter_id;
$$;
```

> This keeps the incident's own reporter from being alerted and only ever returns **accepted**
> contacts of users who enabled WhatsApp and whose rule matched on severity + PostGIS distance.

- [ ] **Step 3: Re-apply and verify both objects**

Run:
```bash
(cd backend && supabase db reset) >/dev/null 2>&1
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.whatsapp_dispatch_log"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.get_alert_matches"
```
Expected: the table prints with the `status` check + `unique (incident_id, contact_id)`, and
`get_alert_matches` is listed (and `get_users_to_alert` is gone).

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/0002_whatsapp_sos.sql
git commit -m "feat(db): add whatsapp_dispatch_log; align proximity RPC to get_alert_matches"
```

---

### Task 5: Verify the demo seed loads and is dense enough (MANDATORY — empty map = failed demo)

**Files:**
- Verify / optionally extend: `backend/supabase/seed.sql`

**Interfaces:**
- Produces: ≥6 active incidents clustered within ~600 m of the configured default center, spanning
  every category and a range of severities/statuses. `reporter_id` stays null (system-owned; the
  `incidents` FK is nullable exactly for this).

- [ ] **Step 1: Confirm the seed loads on reset**

Run:
```bash
(cd backend && supabase db reset) >/dev/null 2>&1
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select count(*), min(severity), max(severity) from public.incidents;"
```
Expected: `count` ≥ 6, severities spanning 1–5.

- [ ] **Step 2: (Optional) add two more incidents for a denser map**

If you want a fuller map, append two rows inside the existing `do $$ … $$` block in `seed.sql`,
following the exact pattern already there (Spanish title/description, a category from the enum, a
severity 1–5, a status, an `st_point(c_long ± d, c_lat ± d)::extensions.geography`, and a
`now() - interval '…'`). Keep offsets within ±0.006 degrees so they stay inside the default 3 km radius.

- [ ] **Step 3: Verify they fall inside the query radius**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select count(*) from public.get_nearby_incidents(-1.05458, -80.45445, 3000, null);"
```
Expected: equals the seeded incident count (all within 3 km) — this is the exact call the map makes.

- [ ] **Step 4: Commit** (only if you changed the seed)

```bash
git add backend/supabase/seed.sql
git commit -m "chore(db): confirm/extend demo seed around the venue center"
```

---

### Task 6: Final end-to-end schema verification

- [ ] **Step 1: Clean reset**

Run: `(cd backend && supabase db reset)`
Expected: applies both migrations + seed with no error.

- [ ] **Step 2: Exercise the three client RPCs the frontend depends on**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  select id, lng, lat from public.get_nearby_incidents(-1.05458,-80.45445,3000,null) limit 1;
"
```
Expected: one row with populated `lng`/`lat`.
(`get_incident_details` and `confirm_incident` require an authenticated `auth.uid()`; they are
exercised end-to-end from the app in F2. Note that in this task.)

- [ ] **Step 3: Report readiness**

State in the commit body that B1 is complete and B2–B5 + the frontend plans may proceed against
the post-H0 contract.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(db): B1 schema/RLS/RPC/seed verified; contract frozen for downstream plans"
```

---

## Self-review notes
- **Coverage:** H0-A (both RPCs return coords) ✓; H0-B (NearbyIncident snake_case + coords,
  CONTRACT §2 updated) ✓; missing `whatsapp_dispatch_log` added ✓; proximity RPC aligned to the
  code's `get_alert_matches(target_incident) → (user_id, contact_id, phone_e164)` ✓; mandatory
  seed verified ✓.
- **Proximity source:** kept `profiles.last_location` (already in `0002`, client-updated) rather
  than the doc's `alert_rules.center`, since no `center` column exists in the migration — but the
  RPC name/shape now matches `findAlertRecipients`, which was the actual breakage.
- **Lane:** only `backend/supabase/**`, plus the H0-owned `backend/core/domain/nearby-incident.ts` and
  `plans/CONTRACT.md`. No other lane touched.
