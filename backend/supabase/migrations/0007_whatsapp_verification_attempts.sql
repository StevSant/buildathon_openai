-- Pulso — server-side rate-limit state for WhatsApp verification resends (issue #6).
-- Owner: server only. Clients never read or write this table: no verification code or secret
-- is stored here (only send counters + timestamps), and the counters must not be forgeable.
-- RLS is enabled with NO policies, so anon/authenticated are denied; the service-role edge
-- function (proximity-dispatcher) bypasses RLS and is the sole reader/writer.
-- Conventions mirror 0002_whatsapp_sos.sql (owner-model tables + explicit Data API revoke).

create table public.whatsapp_verification_attempts (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null default now(),  -- start of the current rolling window
  send_count        integer     not null default 0,      -- sends within the current window
  last_sent_at      timestamptz,                          -- last send; drives the cooldown guard
  last_status       text check (last_status in ('sent','failed')),  -- observability only
  success_count     integer     not null default 0,      -- lifetime successful sends (diagnostics)
  fail_count        integer     not null default 0,       -- lifetime failed sends (diagnostics)
  updated_at        timestamptz not null default now()
);

alter table public.whatsapp_verification_attempts enable row level security;

-- Server-owned: revoke every Data API privilege from the client roles and add no policies, so
-- the counters are reachable only through the service-role edge function. The service role
-- bypasses RLS and retains full access; no explicit grant to anon/authenticated is issued.
revoke all on public.whatsapp_verification_attempts from anon, authenticated;
