-- Issue #27: derive incident visibility TTL from its category at insert time.

-- PostgreSQL applies a column default before BEFORE INSERT triggers. Remove the
-- legacy 24-hour default so omitted/DEFAULT expires_at values reach the trigger
-- as NULL; explicit non-NULL expires_at values remain untouched.
alter table public.incidents
  alter column expires_at drop default;

create or replace function public.set_incident_category_ttl()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ttl interval;
begin
  if new.expires_at is null then
    -- TTL map: accident 6h, fire 6h, flood 12h, road_closure 24h, public_event 8h, other 12h.
    ttl := case new.category
      when 'accident' then interval '6 hours'
      when 'fire' then interval '6 hours'
      when 'flood' then interval '12 hours'
      when 'road_closure' then interval '24 hours'
      when 'public_event' then interval '8 hours'
      when 'other' then interval '12 hours'
      else interval '12 hours'
    end;

    new.expires_at := now() + ttl;
  end if;

  return new;
end;
$$;

drop trigger if exists incidents_category_ttl_before_insert on public.incidents;

create trigger incidents_category_ttl_before_insert
before insert on public.incidents
for each row
execute function public.set_incident_category_ttl();
