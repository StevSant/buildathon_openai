# Pulso — Parallel execution prompts

Ready-to-paste prompts for running the `plans/` in **two concurrent Claude Code sessions**
(one teammate per lane), each fanning out **parallel sub-agents** per plan.

> The lanes are disjoint directories (`frontend/**` vs `backend/**`) with a single frozen seam
> (`plans/CONTRACT.md`), so the two sessions never touch the same files and merges never conflict.
> See [`../00-README.md`](../00-README.md) for the ownership matrix.

---

## How to use

1. **Sync once (H0, 30s):** agree the shared baseline is committed and both lanes branch from it.
   Freeze `plans/CONTRACT.md`, `backend/supabase/migrations/**`, `backend/core/domain` type
   unions, root `package.json` / `tsconfig.base.json`. Nobody edits those concurrently after now.
2. **Session 1 (Person A):** paste [`session-frontend.md`](session-frontend.md) into a fresh
   Claude Code session opened in the repo root.
3. **Session 2 (Person B):** paste [`session-backend.md`](session-backend.md) into a second fresh
   session. It does **B1 first** (schema gate), then fans out.
4. Each orchestrator dispatches one sub-agent per plan using the wrapper prompts in
   [`subagents/`](subagents/). It can paste them verbatim as the `prompt` of a `general-purpose`
   Agent (Task) — issuing all of a group in a **single message** so they run concurrently.

---

## Parallelization map

Because the scaffold already exists (build is green) and every plan is a **surgical edit of
existing, file-disjoint code**, the fan-out is wide and collision-free.

### Frontend lane — all six run in parallel
The orchestrator owns the few shared files first (`app/layout.tsx`, `app/(app)/layout.tsx`,
`components/TabBar.tsx`, providers, `lib/supabase.ts`, and the `index.ts` barrels), then dispatches:

| Sub-agent | Plan | Owns (under `frontend/`) |
|---|---|---|
| F1 | auth + profile | `app/auth/`, `components/AuthForm.tsx`, `app/(app)/profile/page.tsx` |
| F2 | live map | `app/(app)/page.tsx`, `components/IncidentMap.tsx`, `IncidentDetailSheet.tsx`, `lib/incidents.ts` |
| F3 | report | `app/(app)/report/page.tsx`, `components/ReportForm.tsx` |
| F4 | voice assistant | `app/(app)/assistant/page.tsx`, `components/RealtimeAssistant.tsx`, `lib/realtime-agent.ts`, `lib/realtime-tools.ts` |
| F5 | notifications | `app/(app)/notifications/page.tsx`, `components/Notification{Bell,Toast,BottomSheet}.tsx`, `lib/notifications.ts` |
| F6 | safety / WhatsApp / SOS | `app/(app)/profile/security/page.tsx`, `components/EmergencyContactsForm.tsx`, `AlertRulesForm.tsx`, `SosButton.tsx` |

### Backend lane — B1 gate, then B2–B5 in parallel
`B1` freezes the schema/RPCs everything references, so it runs **first, alone**. After it lands,
B2–B5 edit disjoint files (even B3 and B4 only share the `adapters/ai/` *folder*, not any file):

| Sub-agent | Plan | Owns |
|---|---|---|
| **B1 (first)** | schema/RLS/RPC/seed | `backend/supabase/migrations/**`, `backend/supabase/seed.sql` |
| B2 | identity | `backend/supabase/functions/verify-identity/`, `backend/adapters/identity/`, `backend/adapters/persistence/hash-cedula.ts` |
| B3 | vision | `backend/supabase/functions/analyze-report/`, `backend/adapters/ai/openai-vision-analyzer.ts`, `fake-analyzer.ts`, `backend/core/use-cases/analyze-report.ts` |
| B4 | realtime + tools | `backend/supabase/functions/create-realtime-session/`, `agent-tools/`, `backend/adapters/ai/openai-realtime-session-factory.ts`, `realtime-persona.ts` |
| B5 | proximity dispatcher | `backend/supabase/functions/proximity-dispatcher/`, `backend/adapters/messaging/` |

---

## The one collision rule for sub-agents

Sub-agents share one working directory. The only way two of them clash is by editing the **same
file** — almost always an `index.ts` / barrel. So every wrapper prompt forbids editing barrels:
if an agent needs a new export, it **reports it in its return summary** and the orchestrator wires
the barrel after integration. Everything else is file-disjoint by design.

**Turbo alternative:** dispatch each sub-agent with `isolation: worktree` (its own git worktree)
and merge sequentially. Faster, but you trade zero-conflict for some merge reconciliation. For a
hackathon the grouped fan-out above is the reliable fast path.

---

## Verify (no automated tests — ADR-015)

- **Frontend:** sub-agents run `cd frontend && npx tsc --noEmit`; the **orchestrator** runs the
  authoritative `cd frontend && npx tsc --noEmit && npx next build` once after integrating.
- **Backend:** sub-agents run `npm run typecheck`; the orchestrator runs the final
  `npm run typecheck` (core + adapters) and, if Deno is available, `deno check` the edge functions.

## Final review fan-out (both lanes)

After integration, each orchestrator dispatches reviewers in parallel and fixes CRITICAL/HIGH:
- Frontend: `ecc:react-reviewer` + `ecc:typescript-reviewer`
- Backend: `ecc:typescript-reviewer` + `ecc:database-reviewer` + `ecc:security-reviewer`
