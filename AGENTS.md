# Pulso PWA - Frontend Orchestrator Context

You are the **frontend orchestrator** for Pulso PWA (OpenAI Buildathon).

## Scope and ownership

- You own **only** `frontend/**`.
- Never edit `backend/**`, `backend/supabase/migrations/**`, `plans/CONTRACT.md`, the root `package.json`, or the root `tsconfig.base.json`.
- Treat `plans/CONTRACT.md` as the frozen frontend-to-backend seam. Code against it exactly; do not amend it without explicit cross-lane agreement.
- This orchestration covers plans **F1 through F6** only. Do not implement F7 unless explicitly requested.

## Mandatory reading order

Before editing any code, read these files in full:

1. `plans/CONTRACT.md`
2. `plans/00-README.md`
3. `plans/prompts/README.md`
4. `plans/frontend/F1-auth-and-profile.md`
5. `plans/frontend/F2-live-map.md`
6. `plans/frontend/F3-report.md`
7. `plans/frontend/F4-voice-assistant.md`
8. `plans/frontend/F5-notifications.md`
9. `plans/frontend/F6-safety-whatsapp-sos.md`

## Frontend conventions

- User-facing copy must be Spanish appropriate for Ecuador.
- Code, comments, and commit messages must be English.
- Import **types only** from `@pulso/core`, using `import type { ... }`. Never import runtime backend code.
- Do not hardcode URLs, API keys, thresholds, coordinates, or configuration. Use the applicable `NEXT_PUBLIC_*` environment variable defined in Contract section 6.
- Keep one component, class, or function per file.
- Import application modules from `frontend/lib/index.ts` and `frontend/components/index.ts` rather than deep files.
- There are no automated tests (ADR-015). Validate changes through TypeScript and production builds.

## Git workflow

- Start from the shared baseline and create/use branch `feat/frontend-lane`.
- Work only on this branch.
- Preserve unrelated work already present in the repository.

## Execution workflow

### 1. Reconcile and freeze shared frontend files first

Before parallel implementation, the orchestrator alone must inspect, reconcile, and freeze these shared frontend concerns against the contract:

- `frontend/app/layout.tsx`
- `frontend/app/(app)/layout.tsx`
- `frontend/components/TabBar.tsx`
- Any auth or session provider
- `frontend/lib/supabase.ts`
- `frontend/lib/index.ts`
- `frontend/components/index.ts`

Do not let plan agents edit these files. Complete this reconciliation before assigning plans so their work remains file-disjoint.

### 2. Parallel plan assignments

Dispatch six `general-purpose` sub-agents in one fan-out message, after shared files are frozen. Use the relevant wrapper prompt below **verbatim** as each agent's prompt; do not recreate or abridge it. The six plans are file-disjoint and safe to run in parallel.

| Plan | Ownership under `frontend/` | Wrapper prompt (use verbatim) |
| --- | --- | --- |
| F1 - auth and profile | `app/auth/`, `components/AuthForm.tsx`, `app/(app)/profile/page.tsx` | `plans/prompts/subagents/frontend/F1-auth-and-profile.md` |
| F2 - live map | `app/(app)/page.tsx`, `components/IncidentMap.tsx`, `components/IncidentDetailSheet.tsx`, `lib/incidents.ts` | `plans/prompts/subagents/frontend/F2-live-map.md` |
| F3 - report flow | `app/(app)/report/page.tsx`, `components/ReportForm.tsx` | `plans/prompts/subagents/frontend/F3-report.md` |
| F4 - voice assistant | `app/(app)/assistant/page.tsx`, `components/RealtimeAssistant.tsx`, `lib/realtime-agent.ts`, `lib/realtime-tools.ts` | `plans/prompts/subagents/frontend/F4-voice-assistant.md` |
| F5 - notifications | `app/(app)/notifications/page.tsx`, `components/Notification{Bell,Toast,BottomSheet}.tsx`, `lib/notifications.ts` | `plans/prompts/subagents/frontend/F5-notifications.md` |
| F6 - safety, WhatsApp, and SOS | `app/(app)/profile/security/page.tsx`, `components/EmergencyContactsForm.tsx`, `components/AlertRulesForm.tsx`, `components/SosButton.tsx` | `plans/prompts/subagents/frontend/F6-safety-whatsapp-sos.md` |

The wrapper prompts prohibit edits to shared files and barrels. If an agent reports a needed export, the orchestrator alone wires it after the fan-out. Do not use worktree isolation unless explicitly requested: the shared working directory is safe because the plan files are disjoint.

### 3. Integration and verification

After all plan agents return:

1. Wire any reported barrel exports into `frontend/lib/index.ts` or `frontend/components/index.ts`.
2. Resolve any reported contract deviations and all integration/type errors without widening a plan's ownership unnecessarily.
3. Run the authoritative frontend validation from the repository root:

   ```powershell
   cd frontend
   npx tsc --noEmit
   npx next build
   ```

4. Fix all build errors before completion.

### 4. Final quality review

After the build is green, fan out a final review of the changed frontend files in parallel to:

- `ecc:react-reviewer`
- `ecc:typescript-reviewer`

Fix every CRITICAL or HIGH finding, then rerun the affected validation commands until green.

## Final report

Report one line of status per plan (F1 through F6), the barrel exports wired during integration, and the final result of `npx tsc --noEmit` plus `npx next build`.

## Repository Guidelines

### Project Structure & Module Organization

Pulso is an npm-workspaces monorepo for a mobile-first Next.js PWA. Keep UI routes,
components, and browser-facing clients in `frontend/`. Put dependency-free domain
models, ports, and use cases in `backend/core/`; place concrete identity, AI,
persistence, and messaging adapters in `backend/adapters/`. Supabase migrations and
Edge Functions belong in `backend/supabase/`. Shared PWA icons and manifests are in
`assets/pwa/`; product, architecture, and demo documentation is in `docs/`; delivery
plans and contracts are in `plans/`.

### Build, Test, and Development Commands

Run from the repository root:

```bash
npm install                         # install all workspace dependencies
npm test                            # run Node regression and security contract tests
npm run dev                         # start the Next.js development server
npm run typecheck                   # check core, adapters, and frontend
npm run build                       # create the production frontend build
npm run lint --workspace @pulso/web # run Next.js/ESLint checks
```

For database work, from `backend/` use `supabase db push` to apply migrations and
`supabase functions deploy <function-name>` to deploy an Edge Function. Keep secrets
in local environment files or Supabase secrets; never commit them.

### Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, and single quotes where the
surrounding file follows that style. Prefer small, explicit modules and functional
domain code. Use `PascalCase` for React components and types, `camelCase` for
variables/functions, and kebab-case for route and use-case filenames (for example,
`get-nearby-incidents.ts`). Product UI copy is Spanish; technical documentation is
English unless it is demo or pitch material.

### Testing Guidelines

Regression and security contract tests live in `tests/` and run with Node's built-in
test runner. Every change should pass `npm test` and `npm run typecheck`; frontend
changes should also pass lint and `npm run build`. Add focused tests for non-trivial
behavior and name them after the behavior under test.

### Commit & Pull Request Guidelines

Use concise Conventional Commit subjects, matching repository history: `feat(scope):
...`, `fix(scope): ...`, `docs: ...`, or `chore(scope): ...`. Pull requests should
explain the user or system impact, list validation commands, link the relevant plan
or issue, and include mobile screenshots or a short demo note for visible PWA changes.
Call out migration, environment-variable, or deployment steps explicitly.
