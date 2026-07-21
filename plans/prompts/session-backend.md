# Session 2 — Backend orchestrator (Person B)

Paste everything in the block below into a second fresh Claude Code session opened at the repo root.

---

```
You are the BACKEND orchestrator for the Pulso PWA (OpenAI Buildathon). You own ONLY
`backend/supabase/**`, `backend/core/**`, `backend/adapters/**`. Never edit frontend/**,
plans/CONTRACT.md, or root package.json / tsconfig.base.json.

READ FIRST (do not skip):
- plans/CONTRACT.md            (the frozen seam — your RPCs/functions must match these shapes)
- plans/00-README.md          (ownership matrix + conventions)
- plans/prompts/README.md     (parallelization map + the sub-agent collision rule)
- plans/backend/B1..B5.md     (the five plans — skim to confirm scope)

CONVENTIONS (from the plans):
- Derive user_id from the JWT (`userFromJwt`); NEVER trust a user_id in the request body.
- All edge functions return `{ error: string }` on non-2xx (CONTRACT §4 envelope).
- No hardcoded model ids/keys/thresholds — everything via getEnv() / Supabase secrets (CONTRACT §6).
- One symbol per file + package barrels (index.ts re-exports). Code + comments + commits in English;
  model-generated user-facing text (titles/descriptions/persona) in Spanish.
- No automated tests (ADR-015) — verify by typecheck (+ supabase functions serve where noted).

GIT: create branch `feat/backend-lane` from the shared baseline. Work only in it.

EXECUTION STRATEGY:
1. SEQUENTIAL GATE — do B1 FIRST, before any fan-out. Use the wrapper prompt
   plans/prompts/subagents/backend/B1-schema-rls-rpc-seed.md (dispatch it as a single agent, or do
   it yourself). B1 freezes the migrations/RLS/RPCs the whole contract references. Verify it
   (`npm run typecheck`; if Docker/Supabase is available, `cd backend && supabase db reset` to apply
   0001/0002 + seed cleanly). Then post in the shared channel: "B1 is frozen."

2. Then fan out FOUR `general-purpose` sub-agents, ALL IN ONE MESSAGE so they run in parallel.
   Use the wrapper prompts verbatim:
     - plans/prompts/subagents/backend/B2-identity.md
     - plans/prompts/subagents/backend/B3-vision-analysis.md
     - plans/prompts/subagents/backend/B4-realtime-and-tools.md
     - plans/prompts/subagents/backend/B5-proximity-dispatcher.md
   These edit disjoint files (B3 and B4 share only the adapters/ai/ FOLDER, not any file). Each agent
   is told NOT to edit top-level barrels (adapters/index.ts, core/ports, core/use-cases barrels) or
   the frozen migrations — it reports needed exports back to you instead.

3. When agents return: wire any barrel/port exports they flagged, resolve any contract deviations,
   then run the authoritative typecheck to green: `npm run typecheck` (core + adapters). If Deno is
   available, `deno check` each edge function under backend/supabase/functions/.

4. FINAL QA (parallel): dispatch `ecc:typescript-reviewer` + `ecc:database-reviewer` +
   `ecc:security-reviewer` over the changed files; fix CRITICAL and HIGH, then re-run typecheck.

Report back: a one-line status per plan (B1..B5), the barrels/ports you wired, and the final
typecheck result.
```
