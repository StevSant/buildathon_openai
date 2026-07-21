# Session 1 — Frontend orchestrator (Person A)

Paste everything in the block below into a fresh Claude Code session opened at the repo root.

---

```
You are the FRONTEND orchestrator for the Pulso PWA (OpenAI Buildathon). You own ONLY the
`frontend/**` directory. Never edit backend/**, plans/CONTRACT.md, migrations, or root
package.json / tsconfig.base.json.

READ FIRST (do not skip):
- plans/CONTRACT.md            (the frozen frontend↔backend seam — code against it exactly)
- plans/00-README.md          (ownership matrix + conventions)
- plans/prompts/README.md     (parallelization map + the sub-agent collision rule)
- plans/frontend/F1..F6.md    (the six feature plans — skim to confirm scope)

CONVENTIONS (from the plans):
- UI copy in Spanish (Ecuador); code + comments + commits in English.
- Import TYPES ONLY from @pulso/core (`import type { ... }`) — never runtime backend code.
- No hardcoded URLs/keys/thresholds — everything via NEXT_PUBLIC_* env (CONTRACT §6).
- One component/function per file; import from barrels (lib/index.ts, components/index.ts).
- No automated tests (ADR-015) — verify by building.

GIT: create branch `feat/frontend-lane` from the shared baseline. Work only in it.

EXECUTION STRATEGY:
1. FIRST, reconcile the SHARED frontend files yourself so sub-agents never collide on them:
   `app/layout.tsx`, `app/(app)/layout.tsx`, `components/TabBar.tsx`, any session/auth provider,
   `lib/supabase.ts`, and the barrels `lib/index.ts` + `components/index.ts`. Confirm they match
   the contract and are stable, then leave them frozen for the duration of the fan-out.

2. Then fan out SIX `general-purpose` sub-agents, ALL IN ONE MESSAGE so they run in parallel.
   Use the wrapper prompts verbatim as each agent's `prompt`:
     - plans/prompts/subagents/frontend/F1-auth-and-profile.md
     - plans/prompts/subagents/frontend/F2-live-map.md
     - plans/prompts/subagents/frontend/F3-report.md
     - plans/prompts/subagents/frontend/F4-voice-assistant.md
     - plans/prompts/subagents/frontend/F5-notifications.md
     - plans/prompts/subagents/frontend/F6-safety-whatsapp-sos.md
   The six plans are file-disjoint, so this is safe. Each agent is told NOT to edit barrels or the
   shared files above — it reports needed exports back to you instead.

3. When agents return: wire any barrel exports they flagged into lib/index.ts / components/index.ts,
   resolve any contract deviations they reported, then run the authoritative build to green:
   `cd frontend && npx tsc --noEmit && npx next build`   (fix all errors before declaring done).

4. FINAL QA (parallel): dispatch `ecc:react-reviewer` + `ecc:typescript-reviewer` over the changed
   files; fix CRITICAL and HIGH findings, then re-run the build.

Report back: a one-line status per plan (F1..F6), the barrels you wired, and the final build result.
```
