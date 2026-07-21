-- Pulso — demo seed: verified reporters + incidents across Portoviejo, Ecuador.
--
-- Venue center = PUCE Manabí, Portoviejo (keep in sync with NEXT_PUBLIC_DEFAULT_LAT/LNG).
-- Reto 03: ODS 11 (ciudades sostenibles) + ODS 13 (gestión de riesgos).
--
-- Reporters are VERIFIED but have NO whatsapp_config — they are report authors, not
-- WhatsApp subscribers. Inbound/alert numbers live in whatsapp_config, seeded by the
-- registration flow (owned by the frontend/identity lane), never here.
--
-- Idempotent: re-running replaces the demo reporters and their incidents. Real reports
-- created during the demo (with their own reporter_id) are preserved.
--
-- Apply to the linked CLOUD db via the Dashboard SQL editor or psql; locally via
-- `supabase db reset`. Runs as postgres, so RLS is bypassed.

do $$
declare
  c_lat  double precision := -1.05458;   -- Portoviejo centro (PUCE Manabí)
  c_long double precision := -80.45445;
  ana   uuid := gen_random_uuid();
  luis  uuid := gen_random_uuid();
  mary  uuid := gen_random_uuid();
  jose  uuid := gen_random_uuid();
begin
  ---------------------------------------------------------------------------
  -- 1. Clean previous seed (idempotent)
  ---------------------------------------------------------------------------
  delete from auth.users where email like '%@seed.pulso';   -- cascades profiles; those incidents' reporter_id -> null
  delete from public.incidents where reporter_id is null;   -- old system rows + orphans from the cascade above

  ---------------------------------------------------------------------------
  -- 2. Verified reporters (auth.users + profiles). No phone / no whatsapp_config.
  ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', ana,  'authenticated', 'authenticated', 'ana@seed.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', luis, 'authenticated', 'authenticated', 'luis@seed.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', mary, 'authenticated', 'authenticated', 'mary@seed.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', jose, 'authenticated', 'authenticated', 'jose@seed.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

  insert into public.profiles (id, display_name, verified, verification_method, trust_score, created_at)
  values
    (ana,  'Ana Morales',   true, 'registry',    45, now()),
    (luis, 'Luis Zambrano', true, 'registry',    30, now()),
    (mary, 'María Cedeño',  true, 'algorithmic', 22, now()),
    (jose, 'José Vera',     true, 'registry',    18, now());

  ---------------------------------------------------------------------------
  -- 3. Incidents across Portoviejo — varied category / severity / status / reporter
  ---------------------------------------------------------------------------
  insert into public.incidents
    (reporter_id, title, description, category, severity, status, location, created_at, expires_at)
  values
    (ana,  'Accidente de tránsito',  'Colisión leve en Av. Manabí y Ricaurte, un carril bloqueado.',
       'accident',     4, 'confirmed',
       extensions.st_point(c_long + 0.004, c_lat + 0.002)::extensions.geography, now() - interval '8 minutes',  now() + interval '30 days'),
    (luis, 'Inundación en la vía',   'Acumulación de agua en Av. Reales Tamarindos tras la lluvia.',
       'flood',        3, 'confirmed',
       extensions.st_point(c_long - 0.003, c_lat + 0.001)::extensions.geography, now() - interval '40 minutes', now() + interval '30 days'),
    (mary, 'Cierre vial por obras',  'Av. Universitaria cerrada por trabajos municipales, usar desvío.',
       'road_closure', 3, 'confirmed',
       extensions.st_point(c_long + 0.002, c_lat - 0.004)::extensions.geography, now() - interval '1 hour',     now() + interval '30 days'),
    (jose, 'Conato de incendio',     'Humo reportado en el Mercado Central, bomberos en camino.',
       'fire',         5, 'provisional',
       extensions.st_point(c_long - 0.001, c_lat - 0.002)::extensions.geography, now() - interval '4 minutes',  now() + interval '30 days'),
    (ana,  'Feria ciudadana',        'Evento público con alta afluencia en el Parque Las Vegas.',
       'public_event', 1, 'confirmed',
       extensions.st_point(c_long + 0.005, c_lat - 0.001)::extensions.geography, now() - interval '2 hours',    now() + interval '30 days'),
    (luis, 'Semáforo dañado',        'Intersección sin señalización en Av. 5 de Junio y García Moreno.',
       'other',        2, 'disputed',
       extensions.st_point(c_long - 0.004, c_lat + 0.003)::extensions.geography, now() - interval '52 minutes', now() + interval '30 days'),
    (mary, 'Accidente en la Rotonda','Motociclista y auto en la Rotonda de Av. Metropolitana, tránsito lento.',
       'accident',     3, 'provisional',
       extensions.st_point(c_long + 0.001, c_lat + 0.004)::extensions.geography, now() - interval '15 minutes', now() + interval '30 days'),
    (jose, 'Inundación en ciudadela','Calles anegadas en la Cdla. Primero de Mayo, tránsito difícil.',
       'flood',        4, 'confirmed',
       extensions.st_point(c_long - 0.005, c_lat - 0.003)::extensions.geography, now() - interval '1 hour 20 minutes', now() + interval '30 days'),
    (ana,  'Cierre por puente',      'Paso restringido en el puente sobre el Río Portoviejo por mantenimiento.',
       'road_closure', 2, 'resolved',
       extensions.st_point(c_long + 0.006, c_lat + 0.001)::extensions.geography, now() - interval '3 hours',    now() + interval '30 days');
end $$;
