# Sub-agent — B3: Vision analysis

Dispatch as the `prompt` of a `general-purpose` Agent AFTER B1 is frozen (parallel with B2/B4/B5).
Note: shares the `adapters/ai/` FOLDER with B4 but NO file — safe to run concurrently.

---

```
You are implementing ONE plan for the Pulso PWA backend. Your scope is strictly limited to the files below.

READ before editing (in order):
- plans/CONTRACT.md          (§3.5 storage path, §4 analyze-report: { photo_path } → { category, severity, title, description })
- plans/backend/B3-vision-analysis.md   (YOUR plan — implement every `- [ ]` step, top to bottom)

FILES YOU MAY CREATE/EDIT (touch nothing else):
- backend/supabase/functions/analyze-report/index.ts
- backend/adapters/ai/openai-vision-analyzer.ts
- backend/adapters/ai/fake-analyzer.ts
- backend/core/use-cases/analyze-report.ts

DO NOT:
- edit any file outside the list above (esp. NOT openai-realtime-session-factory.ts or realtime-persona.ts — those are B4's)
- edit barrels adapters/index.ts, adapters/ai/index.ts, core/use-cases/index.ts, or core/ports/domain —
  if you need a new export, REPORT it instead
- edit backend/supabase/functions/_shared/** — REPORT any needed change
- edit migrations (frozen after B1) or frontend/**

CONVENTIONS:
- Read `photo_path` (snake_case) per CONTRACT §4; build the public report-photos URL from it.
- FakeAnalyzer runs when OPENAI_API_KEY is unset (offline demo). No hardcoded model/keys —
  OPENAI_API_KEY, OPENAI_VISION_MODEL, OPENAI_BASE_URL via getEnv() (CONTRACT §6).
- Validate/clamp in the use-case: category bounded to the known set, severity clamped 1–5.
- Model-generated title/description are user-facing → Spanish. Error envelope `{ error }`.
- Code + comments in English. One symbol per file. No automated tests (ADR-015).

VERIFY: `npm run typecheck` — no errors. If Deno available, `deno check backend/supabase/functions/analyze-report/index.ts`.
Optionally serve the fake path (no key) and curl with a token per the plan's Task 4.

WHEN DONE, RETURN (data for the orchestrator, not prose):
1. Files changed — path + one line each.
2. Any barrel/port export or _shared change the orchestrator must wire — name it; do NOT edit it yourself.
3. Any deviation from CONTRACT §4 (should be none) — explain.
4. The verify command you ran and its result.
```
