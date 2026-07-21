-- Pulso — demo seed for community comments on a few incidents, so Cerca has real
-- material to interpret when asked for the detail of a case.
--
-- Assumes the standard incident_comments shape:
--   (id, incident_id -> incidents, author_id -> profiles, body, created_at)
-- If your column names differ, adjust the INSERT below.
--
-- Run AFTER seed.sql (needs the incidents to exist). Idempotent for its own authors.
-- Apply via the Dashboard SQL editor. Runs as postgres, so RLS is bypassed.

do $$
declare
  carlos uuid := gen_random_uuid();   -- verified member
  sofia  uuid := gen_random_uuid();   -- community member (unverified)
  pedro  uuid := gen_random_uuid();   -- verified member
  inc_rotonda uuid;
  inc_fire    uuid;
  inc_flood   uuid;
begin
  ---------------------------------------------------------------------------
  -- Clean previous comment-seed authors (cascades their comments)
  ---------------------------------------------------------------------------
  delete from auth.users where email like '%@seedc.pulso';

  ---------------------------------------------------------------------------
  -- Extra members: two verified + one community (unverified) for contrast
  ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', carlos, 'authenticated', 'authenticated', 'carlos@seedc.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', sofia,  'authenticated', 'authenticated', 'sofia@seedc.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', pedro,  'authenticated', 'authenticated', 'pedro@seedc.pulso',
       extensions.crypt('pulso-demo', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

  insert into public.profiles (id, display_name, verified, verification_method, trust_score, created_at)
  values
    (carlos, 'Carlos Loor',    true,  'registry',   28, now()),
    (pedro,  'Pedro Macías',   true,  'registry',   34, now()),
    (sofia,  'Sofía Intriago', false, null,          3, now());   -- community member

  ---------------------------------------------------------------------------
  -- Locate the target incidents by title (from seed.sql)
  ---------------------------------------------------------------------------
  select id into inc_rotonda from public.incidents where title = 'Accidente en la Rotonda' order by created_at desc limit 1;
  select id into inc_fire    from public.incidents where title = 'Conato de incendio'      order by created_at desc limit 1;
  select id into inc_flood   from public.incidents where title = 'Inundación en la vía'    order by created_at desc limit 1;

  ---------------------------------------------------------------------------
  -- Comments (oldest -> newest so the RPC returns them in order)
  ---------------------------------------------------------------------------
  insert into public.incident_comments (incident_id, author_id, body, created_at) values
    -- Accidente en la Rotonda
    (inc_rotonda, carlos, 'Acabo de pasar, la policía ya está regulando el tránsito.', now() - interval '12 minutes'),
    (inc_rotonda, sofia,  'Está congestionado hace rato, mejor tomen la vía alterna por la 24 de Mayo.', now() - interval '9 minutes'),
    (inc_rotonda, pedro,  'El motociclista se ve bien, solo daños materiales.', now() - interval '5 minutes'),
    -- Conato de incendio (Mercado Central)
    (inc_fire,    pedro,  'Ya llegaron dos unidades de bomberos, controlando el humo.', now() - interval '3 minutes'),
    (inc_fire,    sofia,  'Se siente olor a quemado a una cuadra, mejor no acercarse.', now() - interval '2 minutes'),
    -- Inundación en Reales Tamarindos
    (inc_flood,   carlos, 'El agua ya baja, pero un carril sigue anegado.', now() - interval '25 minutes'),
    (inc_flood,   sofia,  'Los carros pequeños no pueden pasar, va lento.', now() - interval '18 minutes');
end $$;
