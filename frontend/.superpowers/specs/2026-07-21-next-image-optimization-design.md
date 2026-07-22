# Incident Photo Optimization Design

## Goal

Remove the two Next.js `no-img-element` build warnings while preserving the existing mobile-first incident-photo layouts and enabling Next.js image optimization for Supabase Storage photos.

## Design

- Replace the raw incident-photo `<img>` elements in `AssistantIncidentDetailCard` and `IncidentDetailSheet` with `next/image`.
- Use `fill` so each image continues to cover its existing fixed-height, responsive container without introducing layout shift.
- Supply responsive `sizes` values so Next.js generates appropriately sized image candidates for the mobile shell.
- Keep `object-fit: cover` in the existing stylesheet and make the assistant-card photo wrapper positioned so `fill` has a containing block.
- Add a narrow `images.remotePatterns` entry in `frontend/next.config.mjs` derived from `NEXT_PUBLIC_SUPABASE_URL`. Permit only the public `report-photos` storage path; do not hardcode the Supabase project hostname.

## Failure Handling

Existing behavior remains unchanged: a missing `photo_path` renders the current placeholder or omits the optional card photo. Invalid remote configuration fails visibly during development/build instead of silently bypassing optimization.

## Validation

The repository intentionally has no frontend automated tests. Use the existing production build warning as the regression signal:

1. Confirm the baseline build reports the two `@next/next/no-img-element` warnings.
2. Run `npx tsc --noEmit` after implementation.
3. Run `npx next build` and confirm it succeeds without either image warning.

## Scope

Only these frontend files may change:

- `frontend/components/AssistantIncidentDetailCard.tsx`
- `frontend/components/IncidentDetailSheet.tsx`
- `frontend/app/globals.css`
- `frontend/next.config.mjs`

