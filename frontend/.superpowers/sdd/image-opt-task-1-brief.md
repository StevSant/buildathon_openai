### Task 1: Optimize incident report photos

**Files:**
- Modify: `frontend/next.config.mjs`
- Modify: `frontend/components/AssistantIncidentDetailCard.tsx`
- Modify: `frontend/components/IncidentDetailSheet.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` and the existing `config.photosBaseUrl` photo URLs.
- Produces: Next.js-optimized responsive images for public `report-photos` objects.

- [ ] **Step 1: Confirm the warning baseline**

Run from `frontend/`:

```powershell
npx next build
```

Expected: the build succeeds but reports `@next/next/no-img-element` for `AssistantIncidentDetailCard.tsx` and `IncidentDetailSheet.tsx`.

- [ ] **Step 2: Configure the Supabase image source**

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

- [ ] **Step 3: Replace the assistant detail-card image**

Import `Image` from `next/image` in `AssistantIncidentDetailCard.tsx`, then replace the raw image with:

```tsx
<Image
  src={photoUrl}
  alt={`Foto del reporte: ${details.title}`}
  fill
  sizes="(max-width: 640px) calc(100vw - 52px), 588px"
/>
```

- [ ] **Step 4: Replace the incident-sheet image**

Import `Image` from `next/image` in `IncidentDetailSheet.tsx`, then replace the raw image with:

```tsx
<Image
  src={photoUrl}
  alt="Foto del incidente"
  fill
  sizes="(max-width: 640px) calc(100vw - 28px), 612px"
/>
```

- [ ] **Step 5: Preserve the assistant-card containing block**

Update the existing rule in `frontend/app/globals.css` so the `fill` image is positioned relative to its photo wrapper:

```css
.icard .ph { position: relative; height: 110px; border-radius: 10px; overflow: hidden; margin: 9px 0 3px; }
```

Keep the existing `object-fit: cover` rules for both image containers.

- [ ] **Step 6: Verify TypeScript**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 7: Verify the optimized production build**

Run from `frontend/`:

```powershell
npx next build
```

Expected: exit code 0 with no `@next/next/no-img-element` warnings.

- [ ] **Step 8: Commit the implementation**

```powershell
git add -- frontend/next.config.mjs frontend/components/AssistantIncidentDetailCard.tsx frontend/components/IncidentDetailSheet.tsx frontend/app/globals.css
git commit -m "perf(frontend): optimize incident photos"
```

