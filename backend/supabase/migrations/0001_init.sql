-- Pulso — initial schema. Mirrors docs/DATA-MODEL.md §2–§6 (authoritative, rewritten).
-- Supabase conventions: PostGIS in the `extensions` schema; functions pin
-- `search_path = ''`; privileged RPCs have explicit EXECUTE grants.

-- ============================================================================
-- §2. Extensions
-- ============================================================================
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;  -- gen_random_uuid, digest/hmac

-- ============================================================================
-- §3. Tables
-- ============================================================================

-- profiles: identity + trust. id mirrors auth.users.id
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  cedula_hash         text unique,                 -- HMAC(pepper, cedula); raw cédula never stored
  verified            boolean not null default false,
  verification_method text check (verification_method in ('registry','algorithmic')),
  trust_score         integer not null default 0,
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
  expires_at    timestamptz not null default (now() + interval '24 hours')  -- default TTL; the adapter's create() can override via INCIDENT_TTL_HOURS (direct client inserts use this default)
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

-- ============================================================================
-- §4. Row Level Security
-- ============================================================================
alter table public.profiles                enable row level security;
alter table public.incidents               enable row level security;
alter table public.incident_confirmations  enable row level security;

-- profiles: a user sees only their own row; only display_name is client-editable.
create policy "own profile - select" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile - update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- incidents: any authenticated user reads active incidents
create policy "incidents - read active" on public.incidents
  for select to authenticated
  using (status <> 'resolved' and (expires_at is null or expires_at > now()));

-- incidents: a user may insert only as themselves
create policy "incidents - insert own" on public.incidents
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- Direct confirmation-table access and incident updates are intentionally absent.
-- Community voting goes only through the restricted confirm_incident RPC.

-- Explicit Data API privileges. Identity/trust and incident state remain server-owned.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke all on public.incidents from anon, authenticated;
grant select, insert on public.incidents to authenticated;

revoke all on public.incident_confirmations from anon, authenticated;

-- ============================================================================
-- §5. RPC functions
-- ============================================================================

-- get_nearby_incidents — the map + agent query
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

-- get_incident_details — one incident, no reporter PII
create or replace function public.get_incident_details(target_id uuid)
returns table (
  id            uuid,
  title         text,
  description   text,
  category      text,
  severity      integer,
  status        text,
  confirmations integer,
  reporter_name text,        -- display_name only; never cédula/email
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

-- confirm_incident — community confirm/dispute (P1). Takes a `kind` argument; one vote per
-- user per incident, switchable. `confirmations` counts 'confirm' votes only; dispute derived.
-- Status rules mirror core/domain/next-incident-status.ts: `resolved` is terminal, a dispute
-- at threshold wins over a confirmation at threshold, and below both thresholds the incident
-- returns to `provisional`. Thresholds are injectable per call (the agent-tools composition
-- root passes CONFIRM_THRESHOLD / DISPUTE_THRESHOLD from env) and default to 3.
create or replace function public.confirm_incident(
  target_id uuid,
  kind      text default 'confirm',
  confirm_threshold integer default 3,
  dispute_threshold integer default 3
)
returns table (id uuid, confirmations integer, status text)
language plpgsql
security definer
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
  if confirm_threshold < 1 or dispute_threshold < 1 then
    raise exception 'thresholds must be positive';
  end if;

  -- Serialize votes for one incident so concurrent recounts cannot overwrite each other.
  perform 1 from public.incidents i where i.id = target_id for update;
  if not found then
    raise exception 'incident not found';
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

-- Functions are not public-by-default API. Grant only the authenticated calls Pulso uses.
revoke all on function public.get_nearby_incidents(double precision, double precision, integer, text)
  from public, anon;
grant execute on function public.get_nearby_incidents(double precision, double precision, integer, text)
  to authenticated;

revoke all on function public.get_incident_details(uuid) from public, anon;
grant execute on function public.get_incident_details(uuid) to authenticated;

revoke all on function public.confirm_incident(uuid, text, integer, integer) from public, anon;
grant execute on function public.confirm_incident(uuid, text, integer, integer) to authenticated;

-- ============================================================================
-- §6. Storage bucket
-- ============================================================================
insert into storage.buckets (id, name, public) values ('report-photos','report-photos', true)
  on conflict (id) do nothing;

create policy "upload own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
