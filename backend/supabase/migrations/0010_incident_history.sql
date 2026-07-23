-- Issue #28: expose an anonymous, bounded history of past incidents by area.

create or replace function public.get_incident_history(
  user_lat      double precision,
  user_long     double precision,
  radius_meters integer default 3000,
  since_hours   integer default 168
)
returns table (
  id              uuid,
  title           text,
  category        text,
  severity        integer,
  status          text,
  created_at      timestamptz,
  expires_at      timestamptz,
  distance_meters double precision
)
language sql
security definer
set search_path = ''
as $$
  select
    i.id,
    i.title,
    i.category,
    i.severity,
    i.status,
    i.created_at,
    i.expires_at,
    extensions.st_distance(
      i.location,
      extensions.st_point(user_long, user_lat)::extensions.geography
    ) as distance_meters
  from public.incidents i
  where (i.status = 'resolved' or i.expires_at <= now())
    and i.created_at >= now() - (since_hours * interval '1 hour')
    and extensions.st_dwithin(
      i.location,
      extensions.st_point(user_long, user_lat)::extensions.geography,
      radius_meters
    )
  order by i.created_at desc
  limit 100;
$$;

revoke all on function public.get_incident_history(
  double precision,
  double precision,
  integer,
  integer
) from public, anon;

grant execute on function public.get_incident_history(
  double precision,
  double precision,
  integer,
  integer
) to authenticated;

grant execute on function public.get_incident_history(
  double precision,
  double precision,
  integer,
  integer
) to service_role;
