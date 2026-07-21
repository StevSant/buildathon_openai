-- Pulso — WhatsApp & SOS safety layer. Mirrors docs/DATA-MODEL.md §9 (authoritative).
-- Same conventions: owner-only RLS, functions `security invoker` with `set search_path = ''`.
-- (The `kind` column + kind-aware confirm_incident live in 0001, per the rewritten spec.)

-- ============================================================================
-- Tables
-- ============================================================================

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

-- ============================================================================
-- Row Level Security (owner-only)
-- ============================================================================
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

-- ============================================================================
-- get_alert_matches — canonical matcher (DATA-MODEL §9). Flat (user, contact, phone) rows.
-- Called by proximity-dispatcher with the service role (bypasses RLS to fan out).
-- ============================================================================
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

-- (find_alert_recipients shim removed — the adapter now calls get_alert_matches directly.)

-- ============================================================================
-- TODO (deploy): wire the incident-insert trigger/webhook to proximity-dispatcher.
-- Option A — Supabase Database Webhook: on INSERT into public.incidents, POST the row
--   to the proximity-dispatcher function URL.
-- Option B — pg_net trigger calling the function URL with the service-role key.
-- Left as a deploy-time TODO: it needs the deployed function URL + service-role secret.
-- ============================================================================
