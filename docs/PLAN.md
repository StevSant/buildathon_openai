# Build Plan — Pulso (full-day Buildathon)

**Version:** 1.0 · **Date:** 2026-07-20

A time-boxed plan for a **team of 3** over a **~9-hour** day. Times are relative hours
(`H0`–`H8`) plus a sample clock assuming a 09:00 start; shift to your actual start.

---

## Roles

| Code | Role | Owns |
|---|---|---|
| **A** | Frontend | `frontend/`: Next.js app, MapLibre, Realtime UI, reporting, auth, and the browser voice/tool bridge |
| **B** | Backend | `backend/core/`, non-messaging adapters and Edge Functions, Supabase schema/PostGIS/RLS/RPC/seed, and the B1+B6 contract gate |
| **C** | Integrations & delivery | Hermes/WhatsApp messaging carve-out, deployment, smoke tests, README/demo/rubric evidence |

Pair up at integration gates. The three tracks start in parallel against
[`plans/CONTRACT.md`](../plans/CONTRACT.md), with one deliberate sequencing point: Person B
finishes the B1+B6 schema/anonymous-reporting gate and announces **B1+B6 frozen** before any
dependent migration or shared-document work continues. Exact file ownership is in
[`plans/00-README.md`](../plans/00-README.md).

## Golden rule
**Seed data and a rehearsed demo beat one more feature.** Freeze scope at H7. Anything not
integrated by then is cut, not finished.

---

## Timeline

### H0 · 09:00–09:45 — Kickoff & setup (everyone)
- [ ] Repo created, pushed; branch protection off (move fast), agreed commit convention.
- [ ] Supabase project created; **enable PostGIS**; grab URL + anon key + service role key.
- [ ] OpenAI access confirmed; **verify the real model IDs** for realtime + vision. Set `OPENAI_*` secrets.
- [ ] Vercel project linked to the repo.
- [ ] `.env.local` filled from [README](../README.md#environment-variables); MapLibre style URL chosen.
- [ ] **Set `NEXT_PUBLIC_DEFAULT_LAT/LNG` to the venue** and note the venue coords for the seed.
- [ ] Review the frozen HTTP/RPC/types in `plans/CONTRACT.md` and the ports in `backend/core/`.
- **Gate 0:** everyone can run `next dev` and reach Supabase.

### H1 · 09:45–11:30 — Foundations (parallel)
- **B:** Execute B1 then B6 as one schema gate: apply the migrations, seed venue data,
  verify RLS/RPC behavior (including anonymous reports), then announce **B1+B6 frozen**.
- **A:** Next.js app skeleton (**mobile-first**: full-screen map, large tap targets);
  `IncidentMap` renders MapLibre centered on the venue; fetch incidents via
  `supabase.rpc('get_nearby_incidents', …)` and drop markers.
- **C:** Build and typecheck the C1 Hermes bridge locally without changing B-owned
  migrations; prepare deployment inputs and webhook secrets.
- **Gate 1 (11:30):** map shows seeded incidents · B1+B6 is frozen · C1 typechecks.
  **This is the riskiest gate — protect it.**

### H2 · 11:30–13:00 — Core features (parallel)
- **B:** Implement the non-messaging backend: `verify-identity`, `analyze-report`,
  `create-realtime-session`, and `agent-tools`, with authenticated user derivation and
  strict input validation.
- **A:** `/auth` sign-up (email + password + cédula) calling `verify-identity`; `/report`
  camera/upload → Storage → `analyze-report` → editable review → publish (INSERT).
- **A:** Tool bridge in `realtime-agent.ts`: handle `response.function_call_arguments.done`
  → invoke `agent-tools` → `function_call_output` → `response.create`. Inject geolocation
  as a `conversation.item.create` context message (not `session.update`, which would
  overwrite the server-set persona). Finalize the "Cerca" persona/instructions.
- **C:** After **B1+B6 frozen**, configure Supabase/Vercel/Hermes, deploy C1, and begin C2
  smoke tests. Do not edit B-owned migrations.

### Lunch / buffer · 13:00–13:30
Eat at your desk if a gate slipped. Do **not** start new features during buffer.

### H3 · 13:30–15:00 — Integration (pair up)
- [ ] **A+B:** End-to-end voice: "¿qué está pasando cerca de mí?" → agent calls tool →
      speaks real seeded incidents; follow-up → `get_incident_details`.
- [ ] **A+B:** Report a real incident with photo → AI fills fields → publish → it appears
      on a **second device's** map live (Realtime).
- [ ] **A+B:** Sign-up with a valid cédula succeeds; invalid cédula blocked; duplicate blocked.
- [ ] **B+C (P2):** Signed DB webhook → proximity match → Hermes WhatsApp delivery; manual
      SOS preserves the frozen `{ type: "sos", location: { lat, lng } }` contract.
- **Gate 3 (15:00):** the full four-pillar thread runs once, end to end, on two devices.

### H4 · 15:00–16:30 — Polish + P1
- [ ] Verified-identity badge on incident cards; status chips (provisional/confirmed/disputed).
- [ ] `confirm_incident` tool + **confirm/dispute** buttons (`kind` arg; flips to
      `confirmed` / `disputed` at threshold).
- [ ] **3-tier in-app notifications** (bottom sheet / toast / notification center via Realtime);
      thresholds from `NEXT_PUBLIC_ALERT_*`. Bell icon in the map top bar.
- [ ] **Permissions & safety onboarding** screen ("Seguridad y WhatsApp"): location (required),
      mic (optional); alert rules (min severity + radius).
- [ ] Marker color by category/severity; incident detail sheet; empty/loading/error states.
- [ ] Spanish copy pass on all user-facing strings.
- [ ] **PWA:** `manifest.json` + icons + `display: standalone`; verify "Add to Home Screen"
      works on a real phone. (Optional: `next-pwa` service worker for the app shell.)
- [ ] **P2 only if ahead:** mobility persona "Ruta" toggle; **WhatsApp safety layer** —
      opt-in emergency contacts + `alert_rules` + `proximity-dispatcher` (Hermes) + manual **SOS**.

### H5 · 16:30–17:15 — Demo hardening
- [ ] Re-seed fresh incidents timed to the demo (recent `created_at`).
- [ ] Rehearse the [DEMO.md](DEMO.md) script twice on the **actual demo devices + venue Wi-Fi**.
- [ ] Test mic permission + geolocation prompts on those devices/browsers ahead of time.
- [ ] Record a **backup screen capture** of the full flow in case live fails.
- **Gate 5 (17:15): SCOPE FREEZE.** No new code. Only bugfixes to the demo path.

### H6 · 17:15–18:00 — Pitch & submit
- [ ] Finalize [PITCH.md](PITCH.md); assign speaking parts; time it (≤ pitch limit).
- [ ] Deploy prod (Vercel + functions); smoke-test the deployed URL.
- [ ] Submit: repo link, deployed URL, description, video/backup.

---

## Integration gates (the only real deadlines)
| Gate | Time | Must be true |
|---|---|---|
| 0 | 09:45 | Everyone connected to Supabase + can run the app |
| 1 | 11:30 | Map shows data · agent speaks · RPC works |
| 3 | 15:00 | Four-pillar thread runs end-to-end on two devices |
| 5 | 17:15 | Scope frozen; demo path green; backup recorded |

## Cut lines (decide fast if behind)
- **Always cuttable first:** the **WhatsApp/SOS safety layer** (P2) — it's an *added* safety
  layer, never a core pillar. Drop it the moment any of the four pillars is at risk.
- Behind at **Gate 1** → drop `confirm_incident`, all P2, and the vision analysis *editing*
  UI (auto-accept AI fields). Protect map + voice + one tool.
- Behind at **Gate 3** → cut cédula **external provider** attempt (algorithmic only), cut
  status lifecycle UI, cut second tool `get_incident_details` (keep `get_nearby_incidents`).
- Behind at **H5** → skip live reporting in the demo; use seeded data + voice only, and
  narrate the report flow from the backup recording.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| WebRTC/mic blocked on venue Wi-Fi | Test at H0/H5 on real devices; have a phone hotspot; backup recording |
| Wrong OpenAI model IDs / rate limits | Confirm IDs at H0; keep `OPENAI_*` in env; have a fallback vision model id |
| Geolocation denied | Manual "set my location" fallback (tap map / default to venue center) |
| Empty map | Seed is mandatory (H1) and re-seeded fresh at H5 |
| Structured output drift from vision | Strict JSON schema + server-side validation; default fields on parse failure |
| Realtime not firing | Confirm table is in the `supabase_realtime` publication; fall back to polling every 5s |
| Cédula edge cases | Sanity-check the algorithmic validator by hand against a few known valid/invalid numbers |
| Hermes WhatsApp gateway down/slow (P2) | Safety layer is P2 — cut first; leave `HERMES_WEBHOOK_URL` unset in dev (dispatcher errors out cleanly); core demo unaffected |

## Definition of done (per pillar)
- **Map:** seeded + live incidents render near the venue; a new insert appears on another device ≤2s.
- **Photo AI:** upload → structured fields returned and shown → published incident stored with photo.
- **Voice:** agent answers two spoken questions using real tool data; no invented incidents.
- **Identity:** valid cédula → verified profile + badge; invalid/duplicate blocked; raw cédula never stored.

## Pre-flight checklist (do the night before)
- [ ] Supabase + Vercel + OpenAI accounts ready; billing/credits confirmed.
- [ ] Confirm exact OpenAI realtime + vision model IDs available to the account.
- [ ] `create-next-app` + deps install verified on each machine.
- [ ] Two charged demo devices; browsers with mic/geolocation permissions pre-granted.
- [ ] This repo cloned on every machine; everyone has read PRD + ARCHITECTURE.
- [ ] *(P2 only)* Hermes webhook URL/shared secret, `PROXIMITY_WEBHOOK_SECRET`, and a test contact number.
