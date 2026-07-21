-- ============================================================================
-- 0003 — get_incident_details v2: photo + dispute count (ADR-020 aligned)
-- Adds `photo_path` (public report-photos bucket) and `disputes` so the detail
-- screen can render the mockup's photo header and "N confirmaron · M lo
-- disputaron" bar. Also drops the legacy `reporter_name` column still present
-- in the previously deployed version of the function (reports stay anonymous
-- to users; `reporter_verified` remains the only reporter-derived field).
-- The call signature is unchanged: get_incident_details(target_id uuid).
-- A return-type change requires drop + recreate.
-- ============================================================================

drop function if exists public.get_incident_details(uuid);

create function public.get_incident_details(target_id uuid)
returns table (
  id                uuid,
  title             text,
  description       text,
  category          text,
  severity          integer,
  status            text,
  confirmations     integer,
  disputes          integer,
  reporter_verified boolean,
  created_at        timestamptz,
  lng               double precision,
  lat               double precision,
  photo_path        text
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
