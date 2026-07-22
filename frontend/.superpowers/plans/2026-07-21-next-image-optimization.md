# Incident Photo Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two raw incident-photo images with responsive Next.js images and authorize only the configured Supabase report-photo path.

**Architecture:** Both incident views will use `next/image` with `fill` inside their existing fixed-height wrappers. `frontend/next.config.mjs` will derive a narrow remote pattern from `NEXT_PUBLIC_SUPABASE_URL`, while the stylesheet preserves the current cover-crop presentation.

**Tech Stack:** Next.js 14, React, TypeScript, CSS, Supabase Storage

## Global Constraints

- Modify only `frontend/**`.
- Do not hardcode the Supabase hostname; derive it from `NEXT_PUBLIC_SUPABASE_URL`.
- Preserve the existing Spanish user-facing copy and mobile-first layouts.
- Do not add automated tests; use TypeScript and the production build as required by ADR-015.

---

### Task 1: Optimize incident report photos

**Files:**
- Modify: `frontend/next.config.mjs`
- Modify: `frontend/components/AssistantIncidentDetailCard.tsx`
- Modify: `frontend/components/IncidentDetailSheet.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` and the existing `config.photosBaseUrl` photo URLs.
- Produces: Next.js-optimized responsive images for public `report-photos` objects.

- [x] **Step 1: Confirm the warning baseline**

Run from `frontend/`:

```powershell
npx next build
```

Expected: the build succeeds but reports `@next/next/no-img-element` for `AssistantIncidentDetailCard.tsx` and `IncidentDetailSheet.tsx`.

- [x] **Step 2: Configure the Supabase image source**

In `frontend/next.config.mjs`, derive the storage origin and add a narrow remote pattern:

```js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pulso/core"],
  images: {
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: supabaseOrigin.protocol.replace(":", ""),
            hostname: supabaseOrigin.hostname,
            port: supabaseOrigin.port,
            pathname: "/storage/v1/object/public/report-photos/**",
          },
        ]
      : [],
  },
};
```

- [x] **Step 3: Replace the assistant detail-card image**

Import `Image` from `next/image` in `AssistantIncidentDetailCard.tsx`, then replace the raw image with:

```tsx
<Image
  src={photoUrl}
  alt={`Foto del reporte: ${details.title}`}
  fill
  sizes="(max-width: 480px) calc(100vw - 60px), 420px"
/>
```

- [x] **Step 4: Replace the incident-sheet image**

Import `Image` from `next/image` in `IncidentDetailSheet.tsx`, then replace the raw image with:

```tsx
<Image
  src={photoUrl}
  alt="Foto del incidente"
  fill
  sizes="(max-width: 480px) calc(100vw - 28px), 452px"
/>
```

- [x] **Step 5: Preserve the assistant-card containing block**

Update the existing rule in `frontend/app/globals.css` so the `fill` image is positioned relative to its photo wrapper:

```css
.icard .ph { position: relative; height: 110px; border-radius: 10px; overflow: hidden; margin: 9px 0 3px; }
```

Keep the existing `object-fit: cover` rules for both image containers.

- [x] **Step 6: Verify TypeScript**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [x] **Step 7: Verify the optimized production build**

Run from `frontend/`:

```powershell
npx next build
```

Expected: exit code 0 with no `@next/next/no-img-element` warnings.

- [x] **Step 8: Commit the implementation**

```powershell
git add -- frontend/next.config.mjs frontend/components/AssistantIncidentDetailCard.tsx frontend/components/IncidentDetailSheet.tsx frontend/app/globals.css
git commit -m "perf(frontend): optimize incident photos"
```
