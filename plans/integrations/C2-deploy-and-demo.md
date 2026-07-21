# C2 — Deploy + Demo URL (integrations lane, Person C)

> **For agentic workers + humans:** mostly operational (dashboards/CLIs). Checkbox steps, no
> automated tests (ADR-015) — verify each step by the stated observable result.

**Goal:** Close the two mandatory rubric deliverables that need infrastructure: a **live demo
URL** (Vercel) backed by **Supabase cloud**, plus the demo-day data freshness pass.

**Depends on:** `B1` **and** `B6` frozen (final migrations 0001/0002) before `db push`. The
Vercel deploy can be prepared in parallel, but the final deploy waits for the frontend lane's
last green build.

**Owns:** Supabase cloud project, Vercel project, deployed env/secrets, demo-day seed. Never
edits `frontend/**` or backend code — config and dashboards only (exception: the 0002 webhook
TODO below, a one-line migration edit agreed with Person B).

---

## Part A — Supabase cloud

- [ ] **1. Create/link the cloud project** — `cd backend && supabase link --project-ref <ref>`.
      Enable PostGIS (Dashboard → Database → Extensions) if the migration doesn't.
- [ ] **2. Push schema + seed** (after B1+B6 are frozen) — `supabase db push`, then apply
      `seed.sql` (SQL editor or `supabase db reset --linked` on a fresh project).
      Verify: `get_nearby_incidents` returns the 6 Portoviejo incidents in the SQL editor.
- [ ] **3. Set function secrets** — `supabase secrets set OPENAI_API_KEY=… CEDULA_HASH_PEPPER=…
      HERMES_WEBHOOK_URL=… HERMES_WEBHOOK_SECRET=…` (Hermes values come from C1 Part C step 5;
      leave unset until then — the dispatcher errors cleanly without them).
- [ ] **4. Deploy edge functions** — `supabase functions deploy verify-identity analyze-report
      create-realtime-session agent-tools proximity-dispatcher`.
      Verify: `curl` each URL returns a JSON `{ error: … }` envelope (not a platform 404).
- [ ] **5. Wire the incident-insert webhook** — the TODO in migration 0002: Database Webhook on
      `incidents` INSERT → `proximity-dispatcher`. Prefer the Dashboard webhook UI; if done as
      SQL, coordinate the migration edit with Person B (migrations are frozen).
      Verify: inserting a seed incident writes a `whatsapp_dispatch_log` row (or a clean
      `HERMES_WEBHOOK_*` error in the function logs while Hermes is not yet linked).
- [ ] **6. Realtime sanity** — confirm `incidents` is in the `supabase_realtime` publication and
      that `create-realtime-session` works with the event credentials/model id
      (`gpt-5.6-*` per the brief). Log the exact model id that worked in the README evidence.

## Part B — Vercel (frontend)

- [ ] **1. Link the repo** to a Vercel project; root directory = `frontend/`.
- [ ] **2. Set `NEXT_PUBLIC_*` env** from `.env.example` (Supabase URL/anon key, default
      lat/lng = Portoviejo `-1.05458,-80.45445`, alert thresholds, map style URL).
- [ ] **3. Deploy + smoke test on a real phone** — map renders seeded incidents, sign-up works,
      PWA "Add to Home Screen" works. This URL is the submitted **demo URL**.

## Part C — Demo-day hardening (from `docs/PLAN.md` H5)

- [ ] **1. Re-seed fresh incidents** timed to the demo (recent `created_at`).
- [ ] **2. Rehearse `docs/DEMO.md` twice** on the actual demo devices + venue Wi-Fi.
- [ ] **3. Record the backup screen capture** of the full flow.
- [ ] **4. Submit:** demo URL + repo URL + README (C3) + video/backup.
