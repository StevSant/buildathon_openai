-- ============================================================================
-- 0004 — Anonymous incident comments
-- Comments are visible through restricted RPCs only. The public shape never exposes
-- author_id, display_name, email, or identity documents (ADR-020 anonymity).
-- ============================================================================

create table public.incident_comments (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

-- The detail screen always filters by incident and reads chronologically.
create index incident_comments_incident_created_idx
  on public.incident_comments (incident_id, created_at asc);

create index incident_comments_author_idx
  on public.incident_comments (author_id);

alter table public.incident_comments enable row level security;

-- Comment rows are server-owned. Clients use the RPCs below so author identifiers do not
-- cross the browser boundary and the active-profile check is enforced consistently.
revoke all on public.incident_comments from anon, authenticated;

create function public.get_incident_comments(target_id uuid)
returns table (
  id                uuid,
  body              text,
  created_at        timestamptz,
  author_verified   boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    c.id,
    c.body,
    c.created_at,
    coalesce(p.verified, false) as author_verified
  from public.incident_comments c
  join public.incidents i on i.id = c.incident_id
  left join public.profiles p on p.id = c.author_id
  where c.incident_id = target_id
    and (select auth.uid()) is not null
    and i.status <> 'resolved'
    and (i.expires_at is null or i.expires_at > now())
  order by c.created_at asc
  limit 100;
$$;

create function public.add_incident_comment(target_id uuid, comment_body text)
returns table (
  id                uuid,
  body              text,
  created_at        timestamptz,
  author_verified   boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := (select auth.uid());
  clean_body text := btrim(comment_body);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_active_profile() then
    raise exception 'account disabled' using errcode = '42501';
  end if;

  if clean_body is null or char_length(clean_body) not between 1 and 1000 then
    raise exception 'comment must contain between 1 and 1000 characters' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.incidents i
    where i.id = target_id
      and i.status <> 'resolved'
      and (i.expires_at is null or i.expires_at > now())
  ) then
    raise exception 'incident not found or inactive';
  end if;

  return query
    with inserted as (
      insert into public.incident_comments (incident_id, author_id, body)
      values (target_id, uid, clean_body)
      returning id, body, created_at, author_id
    )
    select
      inserted.id,
      inserted.body,
      inserted.created_at,
      coalesce(p.verified, false) as author_verified
    from inserted
    left join public.profiles p on p.id = inserted.author_id;
end;
$$;

revoke all on function public.get_incident_comments(uuid) from public, anon;
grant execute on function public.get_incident_comments(uuid) to authenticated;

revoke all on function public.add_incident_comment(uuid, text) from public, anon;
grant execute on function public.add_incident_comment(uuid, text) to authenticated;
