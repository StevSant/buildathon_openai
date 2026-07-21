# Sub-agent — B1: Schema, RLS, RPCs, Seed  ⛔ RUN FIRST (gate)

Dispatch as the `prompt` of a `general-purpose` Agent BEFORE any other backend agent.
This finalizes the schema every other plan and the whole contract references.

---

```
You are implementing the FOUNDATION plan for the Pulso PWA backend. Everything else depends on you,
so you run FIRST and ALONE. Your scope is the database layer only.

READ before editing (in order):
- plans/CONTRACT.md          (§2 shared types, §3.2 RPC signatures, §3.3 table writes, §3.5 Storage — the
                              RPCs and row shapes you build MUST match these EXACTLY, snake_case + lng/lat)
- plans/backend/B1-schema-rls-rpc-seed.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- backend/supabase/migrations/0001_init.sql
- backend/supabase/migrations/0002_whatsapp_sos.sql
- backend/supabase/seed.sql
- backend/supabase/config.toml   (only if the plan requires it, e.g. buckets)

DO NOT:
- edit anything under backend/core/**, backend/adapters/**, or backend/supabase/functions/**
- edit frontend/** or plans/CONTRACT.md
- diverge from the CONTRACT RPC names/args/return columns — the client calls these directly

REQUIREMENTS (from the contract):
- Tables + RLS so the client writes only its own rows; PostGIS geography(Point) for incident location.
- RPCs: get_nearby_incidents(user_lat, user_long, radius_meters, filter_category),
  get_incident_details(target_id), confirm_incident(target_id, kind) — returning the §2 shapes
  (NearbyIncident / IncidentDetails) with snake_case columns incl. lng/lat and distance_meters.
- Storage bucket `report-photos` (public read for the demo).
- Safety tables: whatsapp_config, emergency_contacts, alert_rules (owner-only CRUD) + get_alert_matches.
- Seed Portoviejo-area demo incidents around the venue.
- No hardcoded secrets in SQL.

VERIFY (no automated tests — ADR-015):
- If Docker + Supabase CLI are available: `cd backend && supabase db reset` — must apply 0001, 0002,
  and seed with no error, then spot-check the RPCs return the contract shapes.
- Otherwise: carefully re-read each RPC's SELECT list against CONTRACT §2/§3.2 column-by-column.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. The exact RPC signatures + return columns you shipped (so the orchestrator can confirm they match §3.2).
3. Any deviation from CONTRACT.md (should be none) — explain.
4. The verify step you ran and its result. End with: "B1 is frozen."
```
