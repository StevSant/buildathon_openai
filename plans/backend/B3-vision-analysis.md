# B3 — Vision Analysis Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Backend (`backend/supabase/functions/analyze-report/**`, `backend/adapters/ai/**` (vision + fake),
`backend/core/use-cases/analyze-report.ts`).
**Goal:** A signed-in user posts a photo path; `analyze-report` returns structured incident
fields (`category`, `severity` 1–5, `title`, `description`) from OpenAI vision when a key is
configured, or a deterministic `FakeAnalyzer` offline — always validated and clamped to the
CONTRACT §4 shape.
**Depends on:** B1 (the `report-photos` bucket for the public image URL).
**Reads from CONTRACT:** §3.5 (storage path), §4 (`analyze-report` request/response).

## Global Constraints (apply to every task)
- No hardcoded model ids/keys — `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, `OPENAI_BASE_URL` come
  from `getEnv()`. The FakeAnalyzer runs when `OPENAI_API_KEY` is unset (offline dev/demo).
- One class/function per file; re-export through the barrel.
- Model output titles/descriptions are user-facing → **Spanish** (prompt already enforces this).
  Comments/commits → English.
- User id from JWT (`userFromJwt`); never trust the body for identity.
- `supabase` CLI runs from `backend/`.

**Scaffold reality (verified):** `OpenAIVisionAnalyzer` (strict `json_schema` via the Responses
API), `FakeAnalyzer` (deterministic, Spanish), and the `analyze-report` composition root already
have working bodies. This plan closes: (1) the function reads `photoPath` but CONTRACT §4 and F3
send **`photo_path`** — a real bug (image URL becomes `.../undefined`); (2) the function calls
the use-case with **excess literal props** (`{ userId, photoPath, imageUrl }`) which is a Deno
typecheck error; (3) `makeAnalyzeReport` does NO validation/clamping; (4) `OpenAIVisionAnalyzer`
has a `TODO` about the structured-output accessor.

**FRs covered:** FR-6 (structured suggestion), FR-7 (fields are editable — the function only
suggests; F3 owns the editable UI), FR-8 (the user later publishes). Enables F3.

---

### Task 1: Validate + clamp in the use-case, and guarantee the CONTRACT §4 shape

The model (or the fake) can return an out-of-range severity or an unexpected category. The
use-case is the single choke point that normalizes analyzer output before it reaches the client.

**Files:**
- Modify: `backend/core/use-cases/analyze-report.ts`

**Interfaces:**
- Consumes: `IncidentAnalyzer.analyze({ imageUrl })`, `CATEGORY_VALUES`, `clampSeverity`.
- Produces: `makeAnalyzeReport({ analyzer })` → `(input: { imageUrl: string }) =>
  Promise<{ category: Category; severity: Severity; title: string; description: string }>`.

- [ ] **Step 1: Rewrite the use-case with normalization**

```ts
import { CATEGORY_VALUES, clampSeverity } from '../domain';
import type { Category, Severity } from '../domain';
import type { IncidentAnalyzer } from '../ports';

type AnalyzeReportResult = {
  category: Category;
  severity: Severity;
  title: string;
  description: string;
};

/**
 * Analyze a report photo into structured, VALIDATED incident fields for the user to review.
 * The analyzer output is untrusted (a model or a fake), so category is bounded to the known
 * set and severity is clamped to 1–5 before it leaves the server (CONTRACT §4 shape).
 */
export function makeAnalyzeReport({ analyzer }: { analyzer: IncidentAnalyzer }) {
  return async (input: { imageUrl: string }): Promise<AnalyzeReportResult> => {
    const raw = await analyzer.analyze(input);

    const category: Category = CATEGORY_VALUES.includes(raw.category)
      ? raw.category
      : 'other';
    const severity: Severity = clampSeverity(raw.severity);
    const title = raw.title?.trim() || 'Incidente';
    const description = raw.description?.trim() || '';

    return { category, severity, title, description };
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/core/use-cases/analyze-report.ts
git commit -m "feat(vision): validate category + clamp severity in analyze-report use-case"
```

---

### Task 2: Fix the request field name and the excess-prop call in the function

**Files:**
- Modify: `backend/supabase/functions/analyze-report/index.ts`

**Interfaces:**
- Consumes: request body `{ photo_path: string }` (CONTRACT §4).
- Produces: response `{ category, severity, title, description }`; error `{ error: string }` on non-2xx.

- [ ] **Step 1: Read `photo_path` and call the use-case with only `{ imageUrl }`**

Replace the function body with:

```ts
import OpenAI from "openai";
import { OpenAIVisionAnalyzer, FakeAnalyzer } from "@pulso/adapters";
import { makeAnalyzeReport } from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { userFromJwt } from "../_shared/auth.ts";

// Composition root: authorize → pick analyzer → run makeAnalyzeReport.
// Uses OpenAI vision when OPENAI_API_KEY is set; FakeAnalyzer keeps local dev offline.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    await userFromJwt(req); // authorize; identity not needed further here
    const { photo_path } = await req.json();
    if (typeof photo_path !== "string" || photo_path.length === 0) {
      return Response.json({ error: "photo_path requerido" }, { status: 400, headers: corsHeaders });
    }

    const analyzer = env.openaiApiKey
      ? new OpenAIVisionAnalyzer(
          new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl }),
          env.openaiVisionModel,
        )
      : new FakeAnalyzer();

    // The report-photos bucket is public-read for the demo, so build the URL to fetch.
    const imageUrl = `${env.supabaseUrl}/storage/v1/object/public/report-photos/${photo_path}`;

    const analyzeReport = makeAnalyzeReport({ analyzer });
    const result = await analyzeReport({ imageUrl });

    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
```

> Note (contract): the scaffold previously returned `{ message }` on error; CONTRACT §4 specifies
> `{ error: string }`. This function now uses `{ error }`. The frontend error handling should read
> `data.error` (falling back to `data.message` is harmless if any other function still differs).

- [ ] **Step 2: Commit**

```bash
git add backend/supabase/functions/analyze-report/index.ts
git commit -m "fix(vision): read photo_path per CONTRACT §4 and call use-case with imageUrl only"
```

---

### Task 3: Resolve the structured-output accessor in the vision analyzer

For the OpenAI Responses API with a strict `json_schema` text format, the model returns the JSON
as text; `response.output_text` is the SDK convenience accessor that concatenates it. Keep it,
but guard against an empty/blocked response instead of throwing an opaque `JSON.parse` error.

**Files:**
- Modify: `backend/adapters/ai/openai-vision-analyzer.ts` (the block after `responses.create`)

**Interfaces:**
- Produces: `analyze({ imageUrl })` → `{ category, severity, title, description }` (severity
  already 1–5 per the schema; the use-case clamps defensively regardless).

- [ ] **Step 1: Replace the parse block**

Replace the code from `// TODO: confirm the structured-output accessor…` to the end of the
method with:

```ts
    const text = response.output_text;
    if (!text) {
      throw new Error('El modelo no devolvió un análisis (respuesta vacía).');
    }
    return JSON.parse(text) as {
      category: Category;
      severity: number;
      title: string;
      description: string;
    };
```

> Why `output_text`: it is the documented aggregate of the response's output text items. With a
> strict `json_schema` format the whole output IS that JSON string, so `JSON.parse(output_text)`
> is correct for the current `openai` Node SDK. (If you upgrade to typed parsing, `responses.parse`
> with a zod schema is the alternative — not required here.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/adapters/ai/openai-vision-analyzer.ts
git commit -m "fix(vision): guard the Responses API output_text accessor, drop TODO"
```

---

### Task 4: Verify both analyzer paths end-to-end

`analyze-report` has `verify_jwt = true`, so reuse the token flow from B2.

**Files:** none (verification only).

- [ ] **Step 1: Serve with the fake path (no OpenAI key)**

Run (from `backend/`, no `OPENAI_API_KEY` in the env file):
```bash
cd backend && supabase functions serve analyze-report
```
Expected: boots serving `analyze-report`.

- [ ] **Step 2: Call it with a token (reuse the B2 signup token flow)**

```bash
curl -s "http://127.0.0.1:54321/functions/v1/analyze-report" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"photo_path":"demo/example.jpg"}'
```
Expected: JSON `{"category":"…","severity":<1-5>,"title":"…","description":"…"}` — a deterministic
FakeAnalyzer result (Spanish text). No 500.

- [ ] **Step 3: (If an OpenAI key is available) test the real path**

Add `OPENAI_API_KEY=…` to `backend/supabase/functions/.env`, restart `supabase functions serve
analyze-report --env-file supabase/functions/.env`, upload a real photo to the `report-photos`
bucket under a user prefix, and call with that `photo_path`.
Expected: a plausible category/severity/title/description in Spanish for the photo.

- [ ] **Step 4: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(vision): analyze-report verified on fake + real paths"
```

---

## Self-review notes
- **Coverage:** FR-6 (structured suggestion) ✓; FR-7/FR-8 delivered by F3 (editable review +
  publish) — this plan only produces the suggestion ✓.
- **Bugs fixed:** `photo_path` field name, excess-prop use-case call, unguarded `output_text`,
  missing validation/clamp.
- **Contract:** response `{ category, severity, title, description }`; error `{ error }` (§4).
- **Lane:** only `backend/**`.
