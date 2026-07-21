# Uncertain Report Category Safeguard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an AI-returned `other` category from being published until the reporter explicitly chooses or confirms a category.

**Architecture:** Keep the safeguard entirely inside the existing `ReportForm` review state. Track whether the category has been explicitly resolved, expose the canonical category union as accessible correction buttons when an AI analysis returns `other`, and share one `canPublish` condition between the click handler and disabled button state.

**Tech Stack:** Next.js App Router, React state, TypeScript, `@pulso/core` category types, existing Pulso CSS variables and icon sprite.

## Global Constraints

- Edit only `frontend/**`; never modify the backend, frozen contract, root package, or root TypeScript configuration.
- Keep the `analyze-report` request and response shapes unchanged.
- User-facing copy is Spanish appropriate for Ecuador; code and comments are English.
- Do not add dependencies, environment variables, API requests, or automated tests.
- Preserve all unrelated working-tree changes.
- Validate with `npx tsc --noEmit` and `npx next build` from `frontend/`.

---

### Task 1: Gate publication on an explicit category decision

**Files:**
- Modify: `frontend/components/ReportForm.tsx`

**Interfaces:**
- Consumes: `CATEGORY_VALUES`, `Category`, the existing `CATEGORY_LABELS`, `CATEGORY_META`, and the analyzer response already stored in `AnalyzedFields`.
- Produces: no new exported interface; `ReportForm` gains an internal unresolved-category state and correction UI.

- [ ] **Step 1: Add category-confirmation state and reset it for every photo**

Add state beside the existing `fields` state:

```tsx
const [isCategoryConfirmed, setIsCategoryConfirmed] = useState(false);
```

Reset it in `onPickPhoto` with the other analysis values:

```tsx
setFields(null);
setIsCategoryConfirmed(false);
setLocation(null);
```

When analysis succeeds, keep specific categories on the fast path and leave `other` unresolved:

```tsx
setFields({ ...analysis, severity: clampSeverity(analysis.severity) });
setIsCategoryConfirmed(analysis.category !== "other");
```

- [ ] **Step 2: Centralize category selection and publication readiness**

Add an internal function before `publish`:

```tsx
function chooseCategory(category: Category) {
  setFields((current) => (current ? { ...current, category } : current));
  setIsCategoryConfirmed(true);
}
```

Before `publish`, derive the complete readiness condition:

```tsx
const canPublish = Boolean(fields && photoPath && location && isCategoryConfirmed);
```

Use it in the handler without relying on it for TypeScript narrowing:

```tsx
async function publish() {
  if (!canPublish || !fields || !photoPath || !location) return;
```

- [ ] **Step 3: Make the existing category control resolve uncertainty**

Replace its inline state mutation with the shared function:

```tsx
onChange={(event) => chooseCategory(event.target.value as Category)}
```

- [ ] **Step 4: Render the category correction panel**

Insert this panel directly after the category row and before severity:

```tsx
{fields.category === "other" && !isCategoryConfirmed && (
  <div
    role="alert"
    style={{
      margin: "0 14px 12px",
      padding: 12,
      border: "1px solid color-mix(in srgb, var(--sev-road) 55%, var(--line))",
      borderRadius: 12,
      background: "color-mix(in srgb, var(--sev-road) 8%, var(--panel-2))",
    }}
  >
    <div style={{ display: "flex", gap: 8, color: "var(--sev-road)" }}>
      <Icon name="ic-alert" />
      <div>
        <div style={{ fontSize: 12, fontWeight: 800 }}>
          La IA no pudo identificar el incidente con seguridad.
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>
          ¿Qué está pasando?
        </div>
      </div>
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 7,
        marginTop: 10,
      }}
    >
      {CATEGORY_VALUES.map((category) => {
        const option = CATEGORY_META[category];
        return (
          <button
            key={category}
            type="button"
            aria-pressed={false}
            onClick={() => chooseCategory(category)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              padding: "8px 9px",
              border: `1px solid color-mix(in srgb, ${option.color} 45%, var(--line))`,
              borderRadius: 9,
              background: `color-mix(in srgb, ${option.color} 12%, var(--panel))`,
              color: "var(--ink)",
              fontSize: 11,
              fontWeight: 700,
              textAlign: "left",
            }}
          >
            <Icon name={option.icon} style={{ color: option.color }} />
            <span>{CATEGORY_LABELS[category]}</span>
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 5: Gate and relabel the primary action**

Replace the current disabled condition and label:

```tsx
disabled={!canPublish || phase === "publishing"}
```

```tsx
{phase === "publishing"
  ? "Publicando…"
  : fields && !isCategoryConfirmed
    ? "Confirma la categoría"
    : "Publicar incidente"}
```

- [ ] **Step 6: Run static validation**

Run from `frontend/`:

```powershell
npx tsc --noEmit
npx next build
```

Expected: both commands exit with code 0. Do not claim the feature is complete if either command fails.

- [ ] **Step 7: Review the focused diff**

Run from the repository root:

```powershell
git diff --check -- frontend/components/ReportForm.tsx
git diff -- frontend/components/ReportForm.tsx
```

Expected: no whitespace errors; the diff contains only the category-confirmation state, shared selection/readiness logic, correction panel, and guarded primary action.

- [ ] **Step 8: Commit the implementation without unrelated files**

First inspect the staged set because concurrent work may already be staged:

```powershell
git diff --cached --name-status
```

If the staged set is empty, stage only the report form and plan, then commit:

```powershell
git add -- frontend/components/ReportForm.tsx frontend/docs/superpowers/plans/2026-07-21-uncertain-report-category.md
git commit -m "fix(report): require confirmation for uncertain AI categories"
```

If unrelated paths are staged, do not commit until they can be excluded without changing their working-tree content.
