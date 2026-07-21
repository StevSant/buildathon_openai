# Pulso — Implementation Plans (for Codex, 3 people in parallel)

These are self-contained implementation plans meant to be executed by **Codex**, one plan
at a time. They are split into three **non-colliding lanes** so three people can work
simultaneously without ever editing the same files.

**Read first:** [`CONTRACT.md`](CONTRACT.md) — the frozen frontend↔backend seam. Every plan
codes against it.

---

## Ownership matrix (the non-collision guarantee)

| Lane | May edit ONLY | Owner |
|---|---|---|
| **Frontend** | `frontend/**` | Person A |
| **Backend** | `backend/supabase/**`, `backend/core/**`, `backend/adapters/**` — **minus Person C's messaging carve-out below** | Person B |
| **Integrations & delivery** | The messaging carve-out: `backend/core/ports/messaging-gateway.ts`, `backend/core/use-cases/dispatch-proximity-alerts.ts`, `backend/adapters/messaging/**`, `backend/supabase/functions/proximity-dispatcher/**`, the Hermes block of `backend/supabase/functions/_shared/env.ts` + root `.env.example` — plus `docs/hermes/**`, root `README.md`, and everything off-repo (Hermes VM, Supabase cloud, Vercel) | Person C |

**Frozen at H0 (do not edit concurrently):** `backend/core/domain` type unions,
`backend/supabase/migrations/**`, root `package.json` / `tsconfig.base.json`, `plans/CONTRACT.md`.
(`B6` is the one agreed amendment to migrations + CONTRACT — Person B runs it right after `B1`,
before the fan-out.)

Because the lanes are file-disjoint, git merges to the shared branch never conflict. The two
cross-lane touchpoints, both trivial:

- **Backend barrels** (`@pulso/core` / `@pulso/adapters` `index.ts`): owned by Person B. C1 only
  rewrites files that are already exported, so C normally never needs them — if C does need a new
  export, ask B (30-second sync).
- **`docs/DECISIONS.md`**: B6 appends ADR-020 at the end; C1 inserts a revision note under
  ADR-017. Different regions — merges clean, but say it out loud when you touch it.

---

## Plan index

### Frontend lane — `plans/frontend/` (Person A)
| Plan | Builds | Key files (all under `frontend/`) |
|---|---|---|
| `F1-auth-and-profile.md` | Sign-up/sign-in (email+password+cédula → `verify-identity`), profile + verified badge, settings list | `app/auth/`, `components/AuthForm.tsx`, `app/(app)/profile/page.tsx` |
| `F2-live-map.md` | MapLibre map, markers by category/severity, incident detail sheet (confirm/dispute), live Realtime | `app/(app)/page.tsx`, `components/IncidentMap.tsx`, `components/IncidentDetailSheet.tsx`, `lib/incidents.ts` |
| `F3-report.md` | Camera/upload → Storage → `analyze-report` → editable review → publish | `app/(app)/report/page.tsx`, `components/ReportForm.tsx` |
| `F4-voice-assistant.md` | "Cerca" voice UI, WebRTC session, tool-call bridge to `agent-tools` | `app/(app)/assistant/page.tsx`, `components/RealtimeAssistant.tsx`, `lib/realtime-agent.ts`, `lib/realtime-tools.ts` |
| `F5-notifications.md` | 3-tier in-app notifications (bottom sheet / toast / center + bell) | `app/(app)/notifications/page.tsx`, `components/Notification*.tsx`, `lib/notifications.ts` |
| `F6-safety-whatsapp-sos.md` | "Seguridad y WhatsApp" screen, emergency contacts, alert rules, SOS button | `app/(app)/profile/security/page.tsx`, `components/EmergencyContactsForm.tsx`, `components/AlertRulesForm.tsx`, `components/SosButton.tsx` |
| `F7-anonymous-reporting-ux.md` | Anonymous reports UX (ADR-020): verified chip (no names), report+signup disclaimers, disabled-account errors | `components/IncidentDetailSheet.tsx`, `components/ReportForm.tsx`, `components/AuthForm.tsx`, `lib/incidents.ts` |

### Backend lane — `plans/backend/` (Person B)
| Plan | Builds | Key files |
|---|---|---|
| `B1-schema-rls-rpc-seed.md` | **Do first.** Migrations 0001/0002, RLS, RPCs, storage, seed | `backend/supabase/migrations/**`, `backend/supabase/seed.sql` |
| `B2-identity.md` | `verify-identity` fn, identity adapters, cédula HMAC hashing | `backend/supabase/functions/verify-identity/`, `backend/adapters/identity/` |
| `B3-vision-analysis.md` | `analyze-report` fn, OpenAI vision + Fake analyzer, structured output | `backend/supabase/functions/analyze-report/`, `backend/adapters/ai/` (vision) |
| `B4-realtime-and-tools.md` | `create-realtime-session` (personas + tool contracts) + `agent-tools` router | `backend/supabase/functions/create-realtime-session/`, `backend/supabase/functions/agent-tools/`, `backend/adapters/ai/` (realtime) |
| `B5-proximity-dispatcher.md` | **RETIRED** — superseded by `../integrations/C1` (its non-messaging fixes are preserved there). Do not run. | — |
| `B6-anonymous-reports-abuse-gate.md` | **Do right after B1.** Anonymity + abuse gate (ADR-020): strip `reporter_name` from details RPC, `disabled_at` + `is_active_profile()` RLS, CONTRACT amendment | `backend/supabase/migrations/0001_init.sql`, `backend/core/domain/`, `backend/adapters/persistence/`, `plans/CONTRACT.md`, `docs/` |

### Integrations & delivery lane — `plans/integrations/` (Person C)
| Plan | Builds | Key files |
|---|---|---|
| `C1-hermes-chat-integration.md` | Hermes Agent = WhatsApp layer: `MessagingGateway` → webhook rework, `proximity-dispatcher`, VM-side MCP shim, persona, VM runbook | The messaging carve-out (see matrix) + `docs/hermes/**` |
| `C2-deploy-and-demo.md` | Supabase cloud (db push, secrets, functions, webhook), Vercel demo URL, demo-day seed + rehearsal | Dashboards/CLIs; no app code |
| `C3-readme-rubric.md` | README rubric pass (arquitectura, OpenAI "combustible", evidencia, ODS+métrica) + doc drift cleanup | `README.md`, `docs/DATA-MODEL.md`, `docs/ARCHITECTURE.md` |

---

## Dependencies & suggested order

- **`B1` is the only hard prerequisite for everyone** (it freezes the schema/RPCs the whole
  contract references). Person B does `B1` then `B6` (the agreed schema/CONTRACT amendment)
  back-to-back, announces "B1+B6 frozen", and only then fans out. After that, all three lanes
  run fully in parallel.
- Every frontend plan codes against the **frozen endpoints in `CONTRACT.md`**, so Person A is
  never blocked waiting for a backend function — stub/`FakeAnalyzer` responses match the
  contract shapes. `F7` needs the "B1+B6 frozen" announcement first; start with F1–F6.
- **Person C from H0:** `C1` Part A (messaging carve-out) and Part B (MCP shim) touch none of
  B's files and can start immediately; `C1` Part C (VM runbook) and `C2` Part A need the frozen
  migrations + deployed functions, so they slot naturally after "B1+B6 frozen". `C3` is
  independent and fills any wait.
- Natural pairings once `B1+B6` land: `F1`↔`B2`, `F3`↔`B3`, `F4`↔`B4`, `F6`↔`C1`.
  `F2` and `F5` only need `B1`.

---

## How to run with Codex

1. Person B runs `B1-schema-rls-rpc-seed.md` + `B6` and applies them (freezes schema + contract).
2. Each person points Codex at **one plan file** and lets it execute the checkbox steps.
3. Work on a branch per plan (`feat/f2-live-map`, `feat/b2-identity`, `feat/c1-hermes`).
4. Keep edits inside your lane's files (see the ownership matrix). If you think you need
   to touch a frozen/shared file, ping the owner first — it's a 30-second sync.
5. Merge freely — file-disjoint lanes mean no conflicts.

## Conventions (inherited by every plan)
- No automated tests (ADR-015) — verify by running the demo path.
- No hardcoded URLs/keys/thresholds — everything via env (`CONTRACT.md` §6).
- One class/function/component per file; import from package barrels, not deep files.
- UI copy in **Spanish** (Ecuador); code comments + docs/commits in **English**.
