# F7 — Anonymous Reporting UX Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**` only).
**Goal:** Remove reporter identity from the UI (anonymous reports, ADR-020): a
`Reporte verificado ✓` chip replaces "Reportado por {name}", honest anonymity disclaimers
appear at report time and signup, and a disabled account gets a friendly Spanish error
instead of a raw RLS message.
**Depends on:** B6 (amended CONTRACT §2 + migration + `@pulso/core` type). If B6 has not
landed, you can still write Tasks 2-4, but Task 1 + typecheck only go green after B6.
**Design doc:** `docs/superpowers/specs/2026-07-21-anonymous-reporting-design.md`.
**Reads from CONTRACT:** §2 (`IncidentDetails` — post-B6: no `reporter_name`), §3.2, §3.3.

## Global Constraints (apply to every task)
- UI copy in **Spanish** (Ecuador); the exact strings below are frozen — do not reword.
- The promise must stay honest: anonymous **to other users**; identity kept internally to
  prevent abuse. Never write "100% anónimo" or "nadie puede saber quién eres".
- No hardcoded URLs/keys/thresholds; one component per file; comments/commits in English.
- RLS-blocked writes surface as PostgREST code `42501` — always map that to the friendly
  disabled-account message, never show the raw "row-level security" text.

**Scaffold reality (verified 2026-07-21):** `frontend/lib/incidents.ts:67` maps
`reporter_name`; `frontend/components/IncidentDetailSheet.tsx:53-63` renders "Reportado por";
its `vote()` swallows errors (no error state); `ReportForm.publish()` shows raw error
messages; `AuthForm` already shows the hash disclaimer (extend, don't replace).

---

### Task 1: `lib/incidents.ts` — consume the anonymous contract shape

**Files:**
- Modify: `frontend/lib/incidents.ts:48,67`

**Interfaces:**
- Consumes: post-B6 `IncidentDetails` from `@pulso/core` (no `reporter_name`).
- Produces: `getIncidentDetails(incidentId)` returning that shape — used by Task 2.

- [ ] **Step 1: Drop the mapping line and fix the comment**

Replace:

```ts
// One incident's public detail (no reporter PII beyond display_name).
```

with:

```ts
// One incident's public detail — anonymous: no reporter identity, only reporter_verified (ADR-020).
```

and in the return object of `getIncidentDetails`, replace:

```ts
    confirmations: row.confirmations as number,
    reporter_name: (row.reporter_name as string | null) ?? null,
    reporter_verified: Boolean(row.reporter_verified),
```

with:

```ts
    confirmations: row.confirmations as number,
    reporter_verified: Boolean(row.reporter_verified),
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (requires B6's domain type; if it complains `reporter_name` is missing
on `IncidentDetails`, B6 has not landed yet — that is the expected blocker).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/incidents.ts
git commit -m "feat(map): consume anonymous IncidentDetails — drop reporter_name (ADR-020)"
```

---

### Task 2: `IncidentDetailSheet` — verified chip + friendly vote errors

**Files:**
- Modify: `frontend/components/IncidentDetailSheet.tsx`

**Interfaces:**
- Consumes: `IncidentDetails.reporter_verified`, `confirmIncident` (throws PostgrestError
  with `code === "42501"` when the voter's account is disabled).

- [ ] **Step 1: Update the header comment**

Replace:

```tsx
// Bottom sheet for one incident: reporter, description, community confirmations, and the
```

with:

```tsx
// Bottom sheet for one incident: verification badge, description, community confirmations, and the
```

- [ ] **Step 2: Add an error state and harden `vote()`**

Below `const [busy, setBusy] = useState(false);` add:

```tsx
  const [error, setError] = useState<string | null>(null);
```

Replace the whole `vote` function with:

```tsx
  async function vote(kind: "confirm" | "dispute") {
    setBusy(true);
    setError(null);
    try {
      await confirmIncident(incidentId, kind);
      onClose();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : "";
      setError(
        code === "42501" || /row-level security/i.test(message)
          ? "Tu cuenta está deshabilitada por reportes falsos; no puedes votar."
          : "No pudimos registrar tu voto. Intenta de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 3: Replace the reporter line with the anonymous chip**

Replace:

```tsx
          {d?.reporter_name ? (
            <>
              <span>·</span>
              <span>
                Reportado por {d.reporter_name}
                {d.reporter_verified ? (
                  <span className="text-accent"> ✓ verificado</span>
                ) : null}
              </span>
            </>
          ) : null}
```

with:

```tsx
          {d ? (
            <>
              <span>·</span>
              {d.reporter_verified ? (
                <span className="text-accent">Reporte verificado ✓</span>
              ) : (
                <span>Reporte ciudadano</span>
              )}
            </>
          ) : null}
```

- [ ] **Step 4: Render the vote error**

Directly below the confirmations box (`</div>` of the
`{d?.confirmations ?? 0} confirmaron …` block), add:

```tsx
        {error && <p className="mt-2 text-[12px] text-sev-fire">{error}</p>}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors — in particular no "Property 'reporter_name' does not exist".

- [ ] **Step 6: Commit**

```bash
git add frontend/components/IncidentDetailSheet.tsx
git commit -m "feat(map): anonymous verified chip + friendly disabled-account vote error"
```

---

### Task 3: `ReportForm` — anonymity reassurance + friendly disabled error

**Files:**
- Modify: `frontend/components/ReportForm.tsx`

- [ ] **Step 1: Map the RLS error in `publish()`**

Replace the `catch` block of `publish()`:

```ts
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos publicar el reporte");
      setPhase("ready");
    }
```

with:

```ts
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : "";
      setError(
        code === "42501" || /row-level security/i.test(message)
          ? "Tu cuenta está deshabilitada por reportes falsos y no puede publicar nuevos reportes."
          : message || "No pudimos publicar el reporte",
      );
      setPhase("ready");
    }
```

- [ ] **Step 2: Add the reassurance line at the moment of fear**

Directly below the publish `<button>…Publicar incidente…</button>` (still inside the fields
card), add:

```tsx
          <p className="m-0 text-[11px] leading-relaxed text-faint">
            🔒 Tu reporte es anónimo: otros usuarios nunca ven tu nombre ni tus datos. Tu
            identidad verificada solo se usa para evitar reportes falsos.
          </p>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ReportForm.tsx
git commit -m "feat(report): anonymity reassurance + friendly disabled-account error"
```

---

### Task 4: `AuthForm` — extend the signup disclaimer with the abuse-gate promise

**Files:**
- Modify: `frontend/components/AuthForm.tsx:130-134`

- [ ] **Step 1: Extend the disclaimer**

Replace:

```tsx
      {mode === "signup" && (
        <p className="m-0 flex items-start gap-2 text-[11.5px] text-faint">
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie.
        </p>
      )}
```

with:

```tsx
      {mode === "signup" && (
        <p className="m-0 flex items-start gap-2 text-[11.5px] text-faint">
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie. Tus
          reportes son anónimos para otros usuarios; si una cuenta publica reportes falsos, se
          deshabilita y esa cédula no puede volver a registrarse.
        </p>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/AuthForm.tsx
git commit -m "feat(auth): honest anonymity + abuse-gate disclaimer at signup"
```

---

### Task 5: Verify the full anonymous flow

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `cd frontend && npm run build`
Expected: `next build` completes, 10/10 pages.

- [ ] **Step 2: Manual demo path (against the local stack from B6 Task 5)**

1. Sign up → the extended disclaimer shows under the form.
2. Publish a report → the 🔒 reassurance line is visible next to the publish button.
3. Open the incident from the map → the sheet shows `Reporte verificado ✓` (teal) — **no
   name anywhere**. For a seed incident whose reporter has no verified profile, it shows
   `Reporte ciudadano`.
4. Disable your test account
   (`update public.profiles set disabled_at = now() where id = '<uid>';` via psql), publish
   again → the friendly "Tu cuenta está deshabilitada…" message appears (not a raw RLS
   error). Confirm/dispute on any incident → same friendly vote message.
5. Re-enable (`set disabled_at = null`) → publishing works again.

- [ ] **Step 3: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(frontend): anonymous reporting UX verified (chip, disclaimers, disabled-account errors)"
```

---

## Self-review notes
- **Coverage vs design doc:** chip replaces name ✓; report-time + signup disclaimers with the
  exact approved wording ✓; friendly RLS error on publish AND vote ✓; no other UI surface
  renders reporter identity (grep: `reporter_name` only existed in `incidents.ts` +
  `IncidentDetailSheet.tsx`).
- **Honesty check:** both strings promise anonymity *to other users* and name the abuse gate —
  no absolute-anonymity overclaim.
- **Lane:** `frontend/**` only; types consumed type-only from `@pulso/core` (B6 owns them).
