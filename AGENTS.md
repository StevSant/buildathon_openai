# Repository Guidelines

## Project Structure & Module Organization

Pulso is an npm-workspaces monorepo for a mobile-first Next.js PWA. Keep UI routes,
components, and browser-facing clients in `frontend/`. Put dependency-free domain
models, ports, and use cases in `backend/core/`; place concrete identity, AI,
persistence, and messaging adapters in `backend/adapters/`. Supabase migrations and
Edge Functions belong in `backend/supabase/`. Shared PWA icons and manifests are in
`assets/pwa/`; product, architecture, and demo documentation is in `docs/`; delivery
plans and contracts are in `plans/`.

## Build, Test, and Development Commands

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

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, and single quotes where the
surrounding file follows that style. Prefer small, explicit modules and functional
domain code. Use `PascalCase` for React components and types, `camelCase` for
variables/functions, and kebab-case for route and use-case filenames (for example,
`get-nearby-incidents.ts`). Product UI copy is Spanish; technical documentation is
English unless it is demo or pitch material.

## Testing Guidelines

Regression and security contract tests live in `tests/` and run with Node's built-in
test runner. Every change should pass `npm test` and `npm run typecheck`; frontend
changes should also pass lint and `npm run build`. For time efficiency, do not add new
automated tests unless the user explicitly requests them; verify with the existing suite
and the plan's focused runtime or static checks instead.

## Commit & Pull Request Guidelines

Use concise Conventional Commit subjects, matching repository history: `feat(scope):
...`, `fix(scope): ...`, `docs: ...`, or `chore(scope): ...`. Pull requests should
explain the user or system impact, list validation commands, link the relevant plan
or issue, and include mobile screenshots or a short demo note for visible PWA changes.
Call out migration, environment-variable, or deployment steps explicitly.
