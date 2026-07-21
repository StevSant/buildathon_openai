-- ============================================================================
-- 0005 — Cover the incident comment author foreign key
-- Kept separate because 0004 may already be deployed to a shared Supabase project.
-- ============================================================================

create index if not exists incident_comments_author_idx
  on public.incident_comments (author_id);
