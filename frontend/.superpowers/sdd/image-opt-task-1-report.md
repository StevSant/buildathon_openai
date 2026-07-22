# Task 1 Report: Optimize incident report photos

## Status

DONE

## Implementation

- Derived the configured Supabase origin from `NEXT_PUBLIC_SUPABASE_URL` in `frontend/next.config.mjs`.
- Added a narrow Next.js image remote pattern restricted to `/storage/v1/object/public/report-photos/**` on that configured origin. When the environment variable is absent, no remote origins are allowed.
- Replaced the report photo `<img>` in `AssistantIncidentDetailCard.tsx` with `next/image` using `fill` and `sizes="(max-width: 640px) calc(100vw - 52px), 588px"`.
- Replaced the report photo `<img>` in `IncidentDetailSheet.tsx` with `next/image` using `fill` and `sizes="(max-width: 640px) calc(100vw - 28px), 612px"`.
- Added `position: relative` to `.icard .ph` so the assistant card remains the containing block for its fill image.
- Preserved the existing `object-fit: cover` rules for both image containers.

## Commands and results

All validation commands were run from `frontend/` unless noted otherwise.

### RED baseline

Command:

```powershell
npx next build
```

Result: exit code 0. The build succeeded and reported exactly the two expected `@next/next/no-img-element` warnings:

- `./components/AssistantIncidentDetailCard.tsx`, line 67
- `./components/IncidentDetailSheet.tsx`, line 147

This established the requested pre-change failing signal without adding automated frontend tests, consistent with ADR-015.

### GREEN TypeScript verification

Command:

```powershell
npx tsc --noEmit
```

Result: exit code 0 with no TypeScript errors and no output.

### GREEN production build

Command:

```powershell
npx next build
```

Result: exit code 0. Compilation, lint/type validation, static page generation, and build trace collection all completed successfully. The output contained no `@next/next/no-img-element` warnings and no other warnings.

### Diff checks

Commands run from the repository root:

```powershell
git diff --check -- frontend/next.config.mjs frontend/components/AssistantIncidentDetailCard.tsx frontend/components/IncidentDetailSheet.tsx frontend/app/globals.css
git diff --stat -- frontend/next.config.mjs frontend/components/AssistantIncidentDetailCard.tsx frontend/components/IncidentDetailSheet.tsx frontend/app/globals.css
git diff --cached --check
git diff --cached --name-only
```

Results: all diff checks exited 0. The staged name list contained only the four production files required by the brief. Git emitted informational Windows LF-to-CRLF working-copy notices; no whitespace errors were reported.

## RED/GREEN warning evidence

- RED: the baseline production build emitted two `@next/next/no-img-element` warnings, one for each scoped incident photo component.
- GREEN: after the four-file implementation, the production build emitted zero `@next/next/no-img-element` warnings and zero other warnings.

## Files changed

- `frontend/next.config.mjs`
- `frontend/components/AssistantIncidentDetailCard.tsx`
- `frontend/components/IncidentDetailSheet.tsx`
- `frontend/app/globals.css`

No plans, specs, ledger files, backend files, root configuration, barrels, or unrelated production files were changed or staged by this task.

## Self-review

- Scope: the implementation commit contains exactly the four production files named by the brief.
- Configuration security: the image allowlist uses the environment-configured Supabase origin and permits only the public `report-photos` object path.
- Layout correctness: both `fill` images have positioned containing blocks; `.det-photo` was already relative and `.icard .ph` is now relative.
- Responsive behavior: both components use the exact `sizes` values from the brief.
- Accessibility: the existing Spanish alt text was preserved verbatim.
- Visual behavior: both existing `object-fit: cover` declarations remain intact.
- Code quality: no new functions, abstractions, deep imports, hardcoded service origins, or unrelated cleanup were introduced.
- Verification: TypeScript and a fresh production build both exited 0 after the change; the original warning signal is absent.

## Commit

- SHA: `40f3166`
- Subject: `perf(frontend): optimize incident photos`

## Concerns

None.

## Fix Review

The final reviewer identified that the original `sizes` hints exceeded the app shell's 480px maximum width and could select unnecessarily large image candidates. The approved correction aligns both hints with the actual rendered containers.

### Exact files changed

- `frontend/components/AssistantIncidentDetailCard.tsx`
  - Changed `sizes` to `(max-width: 480px) calc(100vw - 60px), 420px`.
- `frontend/components/IncidentDetailSheet.tsx`
  - Changed `sizes` to `(max-width: 480px) calc(100vw - 28px), 452px`.

### Command results

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Result: exit code 0 with no TypeScript errors and no output.

```powershell
npx next build
```

Result: exit code 0. Compilation, lint/type validation, static page generation, and build trace collection completed successfully.

Run from the repository root:

```powershell
git diff --check -- frontend/components/AssistantIncidentDetailCard.tsx frontend/components/IncidentDetailSheet.tsx
git diff --cached --check
git diff --cached --name-only
```

Result: exit code 0. No whitespace errors were reported, and the staged name list contained only the two approved component files.

### Build-warning result

The production build emitted zero `@next/next/no-img-element` warnings and zero other warnings.

### Self-review

- The assistant card hint accounts for the 480px shell and its 60px combined horizontal space, yielding a 420px desktop cap.
- The incident sheet hint accounts for its 28px horizontal margins, yielding a 452px desktop cap.
- Both values match the approved review correction exactly.
- No image source, alt text, fill behavior, CSS, configuration, or unrelated code changed.
- The follow-up commit contains exactly the two component files.

### Follow-up commit

- SHA: `d3cf312`
- Subject: `perf(frontend): align incident image sizes with shell`

### Fix-review concerns

None.
