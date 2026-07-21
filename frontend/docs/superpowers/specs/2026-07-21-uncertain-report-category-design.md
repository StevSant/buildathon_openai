# Uncertain AI Report Category Safeguard

## Context

The report analyzer can return a structurally valid but semantically wrong result. In the
reported example, a photo with visible collision damage was returned as `other` with a traffic
congestion title. The frontend currently accepts that response as ready to publish. Although the
category badge is technically editable through an invisible select, the interaction is not
obvious and publication remains enabled.

The semantic classification originates in the backend `analyze-report` function. This frontend
lane cannot change that prompt or response contract, so the in-lane fix is a publication safeguard
for the analyzer's least-specific category.

## Goals

- Never publish an AI-suggested `other` category without an explicit reporter decision.
- Make the category correction obvious on a phone-sized report screen.
- Keep accurate, specific AI categories on the current fast path.
- Preserve the frozen `analyze-report` request and response shapes.
- Edit only `frontend/**` and preserve unrelated work.

## Non-goals

- No backend prompt, Edge Function, adapter, migration, contract, or root configuration change.
- No client-side image classifier or keyword-based guess pretending to replace vision analysis.
- No new API request, environment variable, dependency, or automated test suite.
- No automatic conversion from `other` to `accident`; the photo alone must be judged by the user
  when the analyzer is uncertain.

## Considered approaches

### 1. Infer a replacement category from generated text

The frontend could search the AI title and description for words such as `choque` or `tráfico`.
This would not fix the reported example because the wrong response contains only congestion
language. It would also add another unreliable classifier without access to the image.

### 2. Show a warning but keep publication enabled

This makes uncertainty more visible but still allows a quick tap on `Publicar incidente` to store
the wrong category. It reduces confusion without enforcing correctness.

### 3. Require an explicit category decision for `other` (selected)

Treat an analyzer-returned `other` value as unresolved. Show a compact warning and direct category
choices, and disable publication until the reporter selects a category or explicitly confirms
`Otro`. This prevents the observed failure from silently reaching the map while preserving a fast
path for specific AI results.

## Interaction design

When analysis returns any category except `other`, the existing review card remains ready to
publish.

When analysis returns `other`:

1. The category row displays the neutral `Otro` badge as it does today.
2. A high-contrast review panel appears immediately below the category row with the copy:
   `La IA no pudo identificar el incidente con seguridad.`
3. The panel asks `¿Qué está pasando?` and presents six compact buttons using the existing Pulso
   category labels and colors: Cierre vial, Accidente, Inundación, Incendio, Evento público, and
   Otro.
4. Choosing any button updates the category and marks the category as explicitly confirmed.
5. Using the existing category select also marks it confirmed, including an intentional selection
   of `Otro`.
6. Until confirmation, the primary action is disabled and reads `Confirma la categoría`.

The panel uses the established dark navigation palette and category colors. Its signature element
is the category grid itself: the reporter corrects the machine using the same visual language that
will later represent the incident on the map. No new typography, decorative animation, or global
design token is introduced.

## State and data flow

`ReportForm` adds a boolean `isCategoryConfirmed` state.

- Selecting a new photo resets it to `false` while analysis runs.
- A completed analysis sets it to `analysis.category !== "other"`.
- Either category interaction sets it to `true` and updates `fields.category`.
- `publish()` returns early unless the required photo, fields, location, and category confirmation
  are all present.
- The button disabled state uses the same complete condition as `publish()` so UI and behavior
  cannot drift.

No persisted shape changes. Published incidents still use the canonical `Category` union and the
existing insert payload.

## Error handling and accessibility

- The warning is visible text, not color alone.
- Category buttons use `type="button"`, retain readable labels, and expose pressed state for the
  selected value.
- The existing select remains keyboard- and screen-reader-accessible.
- The disabled primary action communicates the exact required next step.
- Upload, analysis, geolocation, and publication errors retain their current behavior.

## Validation

Automated tests are not added per ADR-015 and the repository instructions. Run from `frontend/`:

```powershell
npx tsc --noEmit
npx next build
```

Manual checks:

1. Force or reproduce an analysis response with `category: "other"` and confirm the review panel
   appears and publication is disabled.
2. Choose `Accidente`; confirm the badge changes, the warning resolves, and publication enables.
3. Reproduce `other`, explicitly choose `Otro`, and confirm publication enables.
4. Analyze a response with `category: "accident"`; confirm no warning appears and the normal
   publication path is unchanged.
5. Select a second photo and confirm the previous category decision cannot carry over.

## Ownership

Implementation remains on `feat/frontend-lane` and changes only
`frontend/components/ReportForm.tsx` plus this frontend-owned design record. Existing unrelated
changes, including `frontend/lib/realtime-agent.ts`, are preserved.
