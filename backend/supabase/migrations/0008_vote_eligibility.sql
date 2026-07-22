-- ============================================================================
-- 0007 — vote eligibility: anonymous viewer state + server-side self-vote rejection
-- (issues #13, #14). The next migration number after 0006; earlier migrations are
-- already applied and are never edited.
--
-- get_incident_details (v3) gains three ANONYMOUS, viewer-specific fields derived from
-- the caller's own auth.uid() only — never exposing reporter_id or any reporter PII
-- (ADR-020):
--   * viewer_is_reporter — did THIS caller author the report (so the UI can hide vote
--     controls from the author, issue #13)
--   * can_vote           — is this caller allowed to vote (everyone except the author)
--   * viewer_vote         — the caller's own current vote ('confirm' | 'dispute' | null),
--     so the UI can mark it and block identical resubmission (issue #14)
--
-- confirm_incident is hardened to reject a report's author voting on their own incident.
-- Enforcing it inside this SECURITY DEFINER RPC makes the rule hold for EVERY caller path
-- (map/detail UI, direct RPC, and the voice-tool bridge), which all funnel through it.
--
-- The get_incident_details return type changes, so it must be dropped + recreated. Both
-- call signatures stay frozen: get_incident_details(target_id uuid),
-- confirm_incident(target_id uuid, kind text).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_incident_details v3 — adds viewer_is_reporter, can_vote, viewer_vote
-- ----------------------------------------------------------------------------
drop function if exists public.get_incident_details(uuid);

create function public.get_incident_details(target_id uuid)
returns table (
  id                 uuid,
  title              text,
  description        text,
  category           text,
  severity           integer,
  status             text,
  confirmations      integer,
  disputes           integer,
  reporter_verified  boolean,
  viewer_is_reporter boolean,
  can_vote           boolean,
  viewer_vote        text,
  created_at         timestamptz,
  lng                double precision,
  lat                double precision,
  photo_path         text
)
language sql
security definer
set search_path = ''
as $$
  select
    i.id, i.title, i.description, i.category, i.severity, i.status, i.confirmations,
    (
      select count(*)::integer
      from public.incident_confirmations c
      where c.incident_id = i.id and c.kind = 'dispute'
    ) as disputes,
    coalesce(p.verified, false) as reporter_verified,
    -- Anonymous eligibility: only whether THIS caller authored the report. The reporter's
    -- identity is never returned; seed/system rows (reporter_id is null) are authored by no one.
    (i.reporter_id is not null and i.reporter_id = (select auth.uid())) as viewer_is_reporter,
    -- A report's author may not vote on it (issue #13); every other authenticated user may.
    (i.reporter_id is null or i.reporter_id <> (select auth.uid())) as can_vote,
    -- The caller's own current vote, if any (issue #14). Reads only the caller's own row,
    -- so no other user's vote or identity is exposed.
    (
      select c.kind
      from public.incident_confirmations c
      where c.incident_id = i.id and c.user_id = (select auth.uid())
      limit 1
    ) as viewer_vote,
    i.created_at,
    extensions.st_x(i.location::extensions.geometry) as lng,
    extensions.st_y(i.location::extensions.geometry) as lat,
    i.photo_path
  from public.incidents i
  left join public.profiles p on p.id = i.reporter_id
  where i.id = target_id
    and (select auth.uid()) is not null
    and i.status <> 'resolved'
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_incident_details(uuid) from public, anon;
grant execute on function public.get_incident_details(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- confirm_incident v2 — reject the report author's self-vote (issue #13)
-- Body-only change; the return type (id, confirmations, status) is unchanged, so
-- create-or-replace is safe. Everything else mirrors migration 0001 verbatim: the
-- confirmation thresholds stay private to the function (mirroring the env
-- CONFIRM_THRESHOLD / DISPUTE_THRESHOLD used by core/domain/next-incident-status.ts)
-- so direct clients cannot lower them to forge incident state.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_incident(
  target_id uuid,
  kind      text default 'confirm'
)
returns table (id uuid, confirmations integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid                    uuid := (select auth.uid());
  required_confirmations constant integer := 3;
  required_disputes      constant integer := 3;
  n_confirm              integer;
  n_dispute              integer;
  incident_reporter      uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if kind not in ('confirm','dispute') then
    raise exception 'invalid kind: %', kind;
  end if;
  if not public.is_active_profile() then
    raise exception 'account disabled' using errcode = '42501';
  end if;
  -- Serialize votes for one incident so concurrent recounts cannot overwrite each other,
  -- and capture the reporter for the self-vote guard in the same locked read.
  select i.reporter_id into incident_reporter
  from public.incidents i where i.id = target_id for update;
  if not found then
    raise exception 'incident not found';
  end if;
  -- Issue #13: a report's author must never confirm or dispute their own report. Enforced
  -- server-side so the rule holds for every path (UI, direct RPC, voice tool). The 'PT403'
  -- SQLSTATE makes PostgREST answer HTTP 403 — a predictable authorization error for callers.
  if incident_reporter is not null and incident_reporter = uid then
    raise exception 'reporter cannot vote on own incident' using errcode = 'PT403';
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
                    when n_dispute >= required_disputes then 'disputed'
                    when n_confirm >= required_confirmations then 'confirmed'
                    else 'provisional'
                  end
   where i.id = target_id;

  return query select i.id, i.confirmations, i.status from public.incidents i where i.id = target_id;
end;
$$;

revoke all on function public.confirm_incident(uuid, text) from public, anon;
grant execute on function public.confirm_incident(uuid, text) to authenticated;
