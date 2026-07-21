-- Pulso — demo seed. Copied from docs/DATA-MODEL.md §7.
-- An empty map kills the demo: ~6 incidents around the venue center.
-- Venue = PUCE Manabí, Portoviejo, Ecuador (Cdla. Primero de Mayo). Keep the two
-- center coords in sync with NEXT_PUBLIC_DEFAULT_LAT / NEXT_PUBLIC_DEFAULT_LNG.
-- Themed to Reto 03: ODS 11 (ciudades sostenibles) + ODS 13 (gestión de riesgos).
--
-- Seed rows are system-owned (reporter_id defaults to NULL — allowed by the schema);
-- runs as postgres so RLS is bypassed. expires_at is pushed out 30 days so the map
-- stays populated whenever the demo runs (the default 24h TTL would otherwise expire
-- rows seeded the day before). Idempotent: re-running replaces only the seed rows.

do $$
declare
  c_lat  double precision := -1.05458;   -- Portoviejo centro (PUCE Manabí)
  c_long double precision := -80.45445;
begin
  -- system-owned seed rows only; real reports always carry a reporter_id
  delete from public.incidents where reporter_id is null;

  insert into public.incidents (title, description, category, severity, status, location, created_at, expires_at) values
   ('Cierre vial por obras',        'Avenida cerrada por trabajos municipales.', 'road_closure', 3, 'confirmed',
      extensions.st_point(c_long + 0.004, c_lat + 0.002)::extensions.geography, now() - interval '35 minutes', now() + interval '30 days'),
   ('Accidente de tránsito',        'Colisión leve, un carril bloqueado.',       'accident',     4, 'provisional',
      extensions.st_point(c_long - 0.003, c_lat + 0.001)::extensions.geography, now() - interval '12 minutes', now() + interval '30 days'),
   ('Inundación en calle baja',     'Acumulación de agua tras la lluvia.',       'flood',        3, 'confirmed',
      extensions.st_point(c_long + 0.002, c_lat - 0.004)::extensions.geography, now() - interval '1 hour',     now() + interval '30 days'),
   ('Feria ciudadana',              'Evento público con alta afluencia.',        'public_event', 1, 'confirmed',
      extensions.st_point(c_long - 0.001, c_lat - 0.002)::extensions.geography, now() - interval '2 hours',    now() + interval '30 days'),
   ('Conato de incendio',           'Humo reportado, bomberos en camino.',       'fire',         5, 'provisional',
      extensions.st_point(c_long + 0.005, c_lat - 0.001)::extensions.geography, now() - interval '5 minutes',  now() + interval '30 days'),
   ('Semáforo dañado',              'Intersección sin señalización.',            'other',        2, 'disputed',
      extensions.st_point(c_long - 0.004, c_lat + 0.003)::extensions.geography, now() - interval '48 minutes', now() + interval '30 days');
end $$;
