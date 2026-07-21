# Data Model — Pulso

**Version:** 1.0 · **Date:** 2026-07-20

Canonical schema for Pulso. The SQL below is runnable: paste it into a Supabase migration
(`backend/supabase/migrations/0001_init.sql`) and run `supabase db push`. It follows Supabase
conventions — PostGIS lives in the `extensions` schema, and functions use
`security invoker` with `set search_path = ''`.

---

## 1. Entities

| Table | Purpose |
|---|---|
| `profiles` | One row per user; holds verified-identity state. Raw cédula is never stored. |
| `incidents` | Reported urban incidents with geolocation, category, severity, status. |
| `incident_confirmations` | Community confirm/dispute votes (P1); one per user per incident. |
| `whatsapp_config` | Per-user WhatsApp opt-in + verified phone (migration `0002`). |
| `emergency_contacts` | People a user wants alerted; opt-in tracked (migration `0002`). |
| `alert_rules` | Per-user geofence + severity rule for WhatsApp proximity alerts (migration `0002`). |
| `whatsapp_dispatch_log` | Idempotency/audit for outbound WhatsApp sends (migration `0002`). |

### Enums (as check constraints, for speed)
- **category:** `road_closure`, `accident`, `flood`, `fire`, `public_event`, `other`
- **status:** `provisional` (default), `confirmed`, `disputed`, `resolved`
- **severity:** integer `1`–`5`
- **verification_method:** `registry`, `algorithmic`
- **confirmation kind:** `confirm` (default), `dispute`
- **opt-in status:** `pending` (default), `accepted`, `declined`
- **alert channel:** `whatsapp`
- **dispatch status:** `queued` (default), `sent`, `failed`

## 2. Extensions

```sql
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;  -- gen_random_uuid, digest/hmac
```

## 3. Tables

```sql
-- profiles: identity + trust. id mirrors auth.users.id
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  cedula_hash         text unique,                 -- HMAC(pepper, cedula); raw cédula never stored
  verified            boolean not null default false,
  verification_method text check (verification_method in ('registry','algorithmic')),
  trust_score         integer not null default 0,
  disabled_at         timestamptz,                 -- non-null → account disabled (ADR-020); rows are never deleted
  created_at          timestamptz not null default now()
);

-- incidents: the core geospatial entity
create table public.incidents (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid references public.profiles (id) on delete set null,  -- nullable so seed rows can be system-owned
  title         text not null,
  description   text,
  category      text not null
                  check (category in ('road_closure','accident','flood','fire','public_event','other')),
  severity      integer not null default 1 check (severity between 1 and 5),
  status        text not null default 'provisional'
                  check (status in ('provisional','confirmed','disputed','resolved')),
  location      extensions.geography(point) not null,
  photo_path    text,                              -- Storage path in report-photos bucket
  confirmations integer not null default 0,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours')  -- app overrides from INCIDENT_TTL_HOURS
);

create index incidents_location_idx on public.incidents using gist (location);
create index incidents_status_idx   on public.incidents (status);
create index incidents_created_idx  on public.incidents (created_at desc);

-- community confirm/dispute votes (P1)
create table public.incident_confirmations (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'confirm' check (kind in ('confirm','dispute')),  -- community trust vote
  created_at  timestamptz not null default now(),
  unique (incident_id, user_id)   -- one vote per user per incident, either kind
);
```

## 4. Row Level Security

```sql
alter table public.profiles                enable row level security;
alter table public.incidents               enable row level security;
alter table public.incident_confirmations  enable row level security;

-- profiles: a user sees and edits ONLY their own row
create policy "own profile - select" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "own profile - upsert" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "own profile - update" on public.profiles
  for update using ((select auth.uid()) = id);

-- incidents: any authenticated user reads active incidents
create policy "incidents - read active" on public.incidents
  for select to authenticated
  using (status <> 'resolved' and (expires_at is null or expires_at > now()));

-- incidents: a user may insert only as themselves
create policy "incidents - insert own" on public.incidents
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- incidents: a user may update only their own report (P1: moderators added later)
create policy "incidents - update own" on public.incidents
  for update to authenticated
  using (reporter_id = (select auth.uid()));

-- confirmations: insert as self, read your own
create policy "confirmations - insert own" on public.incident_confirmations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "confirmations - read own" on public.incident_confirmations
  for select to authenticated using (user_id = (select auth.uid()));
```

> Seed and Edge Functions using the **service role** bypass RLS; that's expected. RLS
> protects the **client**, which uses the anon key + user JWT.

## 5. RPC functions

### `get_nearby_incidents` — the map + agent query
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

### `get_incident_details` — one incident, no reporter PII
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

### `confirm_incident` — community confirm/dispute (P1)
Takes a `kind` argument. A user has **one** vote per incident, switchable between `confirm` and
`dispute`. Enough confirms flip status toward `confirmed`; enough disputes toward `disputed`.
`incidents.confirmations` counts `confirm` votes only; the dispute count stays derived.
Status rules mirror `core/domain/next-incident-status.ts`: `resolved` is terminal, a dispute
at threshold wins over a confirmation at threshold, and below both thresholds the incident
returns to `provisional`. Thresholds are injectable per call (defaults 3; the agent-tools
composition root passes `CONFIRM_THRESHOLD` / `DISPUTE_THRESHOLD` from env).
```sql
create or replace function public.confirm_incident(
  target_id uuid,
  kind      text default 'confirm',
  confirm_threshold integer default 3,
  dispute_threshold integer default 3
)
returns table (id uuid, confirmations integer, status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid       uuid := (select auth.uid());
  n_confirm integer;
  n_dispute integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if kind not in ('confirm','dispute') then
    raise exception 'invalid kind: %', kind;
  end if;

  insert into public.incident_confirmations (incident_id, user_id, kind)
  values (target_id, uid, kind)
  on conflict (incident_id, user_id) do update set kind = excluded.kind;

  select
    count(*) filter (where c.kind = 'confirm'),
    count(*) filter (where c.kind = 'dispute')
    into n_confirm, n_dispute
  from public.incident_confirmations c
  where c.incident_id = target_id;

  update public.incidents i
     set confirmations = n_confirm,
         status = case
                    when i.status = 'resolved' then 'resolved'
                    when n_dispute >= dispute_threshold then 'disputed'
                    when n_confirm >= confirm_threshold then 'confirmed'
                    else 'provisional'
                  end
   where i.id = target_id;

  return query select i.id, i.confirmations, i.status from public.incidents i where i.id = target_id;
end;
$$;
```

## 6. Storage bucket

Create bucket `report-photos` (public read for the demo). Policy: authenticated users may
upload under their own prefix.

```sql
insert into storage.buckets (id, name, public) values ('report-photos','report-photos', true)
  on conflict (id) do nothing;

create policy "upload own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

## 7. Seed (demo data — MANDATORY)

An empty map kills the demo. Seed ~6 incidents around the **venue** center — PUCE Manabí,
Portoviejo (Cdla. Primero de Mayo); keep the two center coords in sync with
`NEXT_PUBLIC_DEFAULT_LAT` / `NEXT_PUBLIC_DEFAULT_LNG`. The canonical, runnable copy lives
in `backend/supabase/seed.sql` (wired via `[db.seed]` in `config.toml`); it is idempotent
(re-running replaces only the system-owned rows) and pushes `expires_at` out 30 days so the
map stays populated whenever the demo runs.

```sql
-- Center: change these two numbers to the venue location
do $$
declare
  c_lat  double precision := -1.05458;   -- Portoviejo centro (PUCE Manabí)
  c_long double precision := -80.45445;
begin
  -- system-owned seed rows only; real reports always carry a reporter_id
  delete from public.incidents where reporter_id is null;

  insert into public.incidents (title, description, category, severity, status, location, created_at, expires_at) values
   ('Cierre vial por obras',        'Avenida cerrada por trabajos municipales.', 'road_closure', 3, 'confirmed',
      extensions.st_point(c_long + 0.004, c_lat + 0.002)::extensions.geography, now() - interval '35 minutes', now() + interval '30 days'),
   ('Accidente de tránsito',        'Colisión leve, un carril bloqueado.',       'accident',     4, 'provisional',
      extensions.st_point(c_long - 0.003, c_lat + 0.001)::extensions.geography, now() - interval '12 minutes', now() + interval '30 days'),
   ('Inundación en calle baja',     'Acumulación de agua tras la lluvia.',       'flood',        3, 'confirmed',
      extensions.st_point(c_long + 0.002, c_lat - 0.004)::extensions.geography, now() - interval '1 hour',     now() + interval '30 days'),
   ('Feria ciudadana',              'Evento público con alta afluencia.',        'public_event', 1, 'confirmed',
      extensions.st_point(c_long - 0.001, c_lat - 0.002)::extensions.geography, now() - interval '2 hours',    now() + interval '30 days'),
   ('Conato de incendio',           'Humo reportado, bomberos en camino.',       'fire',         5, 'provisional',
      extensions.st_point(c_long + 0.005, c_lat - 0.001)::extensions.geography, now() - interval '5 minutes',  now() + interval '30 days'),
   ('Semáforo dañado',              'Intersección sin señalización.',            'other',        2, 'disputed',
      extensions.st_point(c_long - 0.004, c_lat + 0.003)::extensions.geography, now() - interval '48 minutes', now() + interval '30 days');
end $$;
```

## 8. Notes / trade-offs
- `reporter_id` is nullable **only** so seed rows can be system-owned; every client insert
  sets it via RLS (`reporter_id = auth.uid()`).
- `expires_at` DB default is 24h; direct client inserts (the report flow) rely on it, and
  the adapter's `create()` path can override it from `INCIDENT_TTL_HOURS`.
- Near-duplicate detection (same category within N meters) is a P2 stretch — not modeled.
- Production would move Realtime from Postgres Changes to Broadcast-with-triggers; see
  [DECISIONS.md](DECISIONS.md#adr-006).

## 9. WhatsApp & SOS (migration 0002)

The optional safety layer ([ADR-017](DECISIONS.md)). Paste this into a second migration
(`backend/supabase/migrations/0002_whatsapp_sos.sql`) and `db push`. Same Supabase conventions as
`0001`: RLS **owner-only**, functions `security invoker` with `set search_path = ''`.

```sql
-- whatsapp_config: per-user WhatsApp opt-in + verified own phone
create table public.whatsapp_config (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  enabled     boolean not null default false,
  phone_e164  text,                                  -- the user's own number, E.164
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- emergency_contacts: people I want alerted; each must opt in over WhatsApp
create table public.emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  display_name  text,
  phone_e164    text not null,
  opt_in_status text not null default 'pending'
                  check (opt_in_status in ('pending','accepted','declined')),
  created_at    timestamptz not null default now(),
  unique (owner_id, phone_e164)
);

-- alert_rules: when to trigger a WhatsApp alert for incidents near me
create table public.alert_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  min_severity  integer not null default 4 check (min_severity between 1 and 5),
  radius_meters integer not null default 500,
  center        extensions.geography(point),          -- my watch location (last-known); lets the
                                                       -- dispatcher match st_dwithin(incident.location, center, radius_meters)
  channel       text not null default 'whatsapp' check (channel in ('whatsapp')),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

create index alert_rules_center_idx on public.alert_rules using gist (center);

-- whatsapp_dispatch_log: idempotency + audit for outbound sends
create table public.whatsapp_dispatch_log (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents (id) on delete set null,
  contact_id  uuid references public.emergency_contacts (id) on delete set null,
  status      text not null default 'queued'
                check (status in ('queued','sent','failed')),
  created_at  timestamptz not null default now(),
  unique (incident_id, contact_id)   -- send at most once per incident per contact
);
```

### Row Level Security (owner-only)

```sql
alter table public.whatsapp_config       enable row level security;
alter table public.emergency_contacts    enable row level security;
alter table public.alert_rules           enable row level security;
alter table public.whatsapp_dispatch_log enable row level security;

-- whatsapp_config: own row only
create policy "whatsapp_config - all own" on public.whatsapp_config
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- emergency_contacts: owner only
create policy "emergency_contacts - all own" on public.emergency_contacts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- alert_rules: owner only
create policy "alert_rules - all own" on public.alert_rules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- whatsapp_dispatch_log: read logs for your own contacts (writes are service-role only)
create policy "dispatch_log - read own" on public.whatsapp_dispatch_log
  for select to authenticated
  using (exists (
    select 1 from public.emergency_contacts ec
    where ec.id = whatsapp_dispatch_log.contact_id
      and ec.owner_id = (select auth.uid())
  ));
```

> `proximity-dispatcher` runs with the **service role** and bypasses RLS to fan out across many
> users' rules — the same pattern as seed and the other Edge Functions.

### `get_alert_matches` — who to WhatsApp for a new incident

Powers `proximity-dispatcher`: given a new incident, return the (user, contact, phone) rows to
send to — matching enabled alert rules by PostGIS distance + severity, only for users with
WhatsApp enabled and only their **accepted** contacts.

```sql
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
  from public.incidents i
  join public.alert_rules r
    on r.enabled
   and r.center is not null
   and i.severity >= r.min_severity
   and extensions.st_dwithin(i.location, r.center, r.radius_meters)
  join public.whatsapp_config wc
    on wc.user_id = r.user_id and wc.enabled
  join public.emergency_contacts ec
    on ec.owner_id = r.user_id and ec.opt_in_status = 'accepted'
  where i.id = target_incident;
$$;
```

### Notes / trade-offs (safety layer)
- **`alert_rules.center`** is an addition to the base spec: server-side proximity needs a stored
  location per user (INSERT fires with no client present). The client writes the user's
  last-known location here; a rule with a null `center` simply doesn't match server-side while
  the in-app 3-tier alerts still work client-side.
- `whatsapp_dispatch_log`'s `unique(incident_id, contact_id)` makes the dispatcher **idempotent**
  under retries and duplicate trigger fires.
- The manual **SOS** path reuses `emergency_contacts` (accepted only) but bypasses proximity —
  it messages all your contacts immediately with an SOS template.
