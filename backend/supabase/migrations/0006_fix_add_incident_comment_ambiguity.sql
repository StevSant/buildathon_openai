-- ============================================================================
-- 0006 — Fix output-column ambiguity in the comment creation RPC
-- ============================================================================

create or replace function public.add_incident_comment(target_id uuid, comment_body text)
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
      insert into public.incident_comments as comment (incident_id, author_id, body)
      values (target_id, uid, clean_body)
      returning comment.id, comment.body, comment.created_at, comment.author_id
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

revoke all on function public.add_incident_comment(uuid, text) from public, anon;
grant execute on function public.add_incident_comment(uuid, text) to authenticated;
