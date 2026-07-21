# Pulso — Implementation Plans (for Codex, 3 people in parallel)

These are self-contained implementation plans meant to be executed by **Codex**, one plan
at a time. They are split into three file-owned lanes so three people can work simultaneously.
The few shared documentation files are sequenced explicitly instead of being edited concurrently.

**Read first:** [`CONTRACT.md`](CONTRACT.md) — the frozen frontend↔backend seam. Every plan
codes against it.

---

## Ownership matrix

| Lane | May edit ONLY | Owner |
|---|---|---|
| **Frontend** | `frontend/**` | Person A |
| **Backend** | `backend/supabase/**`, `backend/core/**`, `backend/adapters/**` — **minus Person C's messaging carve-out below** | Person B |
| **Integrations & delivery** | The messaging carve-out: `backend/core/ports/messaging-gateway.ts`, `backend/core/use-cases/dispatch-proximity-alerts.ts`, `backend/adapters/messaging/**`, `backend/supabase/functions/proximity-dispatcher/**`, the Hermes block of `backend/supabase/functions/_shared/env.ts` + root `.env.example` — plus `docs/hermes/**`, root `README.md`, and everything off-repo (Hermes VM, Supabase cloud, Vercel) | Person C |

**Bootstrap gate (Person B):** run B1 and B6 back-to-back before database- or
anonymity-dependent work. During that gate, Person B owns `backend/core/domain`,
`backend/supabase/migrations/**`, `plans/CONTRACT.md`, `docs/DECISIONS.md`, and
`docs/DATA-MODEL.md`. Person B then announces **"B1+B6 frozen"**.

The application lanes are file-disjoint after that gate. Shared touchpoints are handled as follows:

- **Backend barrels** (`@pulso/core` / `@pulso/adapters` `index.ts`): owned by Person B. C1 only
  rewrites files that are already exported, so C normally never needs them — if C does need a new
  export, ask B (30-second sync).
- **Shared docs:** Person C edits `docs/DECISIONS.md` and `docs/DATA-MODEL.md` only after the
  B1+B6 freeze. C3's final evidence pass runs after C2 produces the demo URL/model notes.
- **Migrations and contract:** Person C never edits them. Deployment-only wiring belongs in
  Supabase Dashboard/CLI steps, not in a late migration exception.

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

- **`B1+B6` is the bootstrap gate** for the final schema, RLS, RPCs, and anonymous public
  contract. Person B runs them back-to-back and announces "B1+B6 frozen" before B2-B4,
  F7, C1 deployment checks, or C2 database work.
- Every frontend plan codes against the **frozen endpoints in `CONTRACT.md`**, so Person A is
  never blocked waiting for a backend function — stub/`FakeAnalyzer` responses match the
  contract shapes. `F7` needs the "B1+B6 frozen" announcement first; start with F1–F6.
- **Person C from H0:** C1's messaging carve-out and MCP shim can start immediately. C1's
  deployment checks and C2 database work wait for "B1+B6 frozen". C3 can prepare structure
  during the wait, but its final evidence pass waits for both B6's docs edits and C2's outputs.
- Natural pairings once `B1+B6` land: `F1`↔`B2`, `F3`↔`B3`, `F4`↔`B4`, `F6`↔`C1`.
  `F2` and `F5` only need `B1`.

---

## How to run with Codex

1. Person B runs `B1-schema-rls-rpc-seed.md` + `B6` and applies them (freezes schema + contract).
2. Each person points Codex at **one plan file** and lets it execute the checkbox steps.
3. Work on a branch per plan (`feat/f2-live-map`, `feat/b2-identity`, `feat/c1-hermes`).
4. Keep edits inside your lane's files (see the ownership matrix). If you think you need
   to touch a frozen/shared file, ping the owner first — it's a 30-second sync.
5. Merge application work freely; merge the explicitly shared docs in the sequence above.

## Conventions (inherited by every plan)
- No automated tests (ADR-015) — verify by running the demo path.
- No hardcoded URLs/keys/thresholds — everything via env (`CONTRACT.md` §6).
- One class/function/component per file; import from package barrels, not deep files.
- UI copy in **Spanish** (Ecuador); code comments + docs/commits in **English**.
