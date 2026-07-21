# C3 — README rubric pass (integrations lane, Person C)

> **For agentic workers:** docs-only plan. Checkbox steps; verify by reading the rendered
> README against the rubric. Commit after each task (Conventional Commits, English).

**Goal:** Make the README satisfy the mandatory delivery of Reto 03 — *arquitectura, OpenAI
"combustible", evidencia, ODS + métrica* — and clear the known cosmetic doc drift.

**Owns:** root `README.md`, `docs/DATA-MODEL.md` cosmetics, `docs/ARCHITECTURE.md` cosmetics.
Coordinate with Person B before touching anything B6 also edits (`docs/DECISIONS.md` regions).

---

## Task 1: README rubric sections

- [ ] **Arquitectura** — current monorepo layout (`frontend/` + `backend/{core,adapters,supabase}`),
      hexagonal ports/adapters summary, one diagram or ASCII sketch, links to `docs/`.
- [ ] **OpenAI como combustible** — per model: which (`gpt-5.6-terra` vision, Realtime voice
      "Cerca", Responses/structured outputs), why, what data goes in, what actions come out,
      where a human approves (report review screen), and how it was tested.
- [ ] **Evidencia** — screenshots/GIFs of the four pillars (map, photo→AI report, voice, cédula
      badge) + the demo URL and any model-id notes from C2.
- [ ] **ODS + métrica** — ODS 11 (primary) + ODS 13 (secondary), one honest impact metric
      (e.g., median time from report to community awareness in the demo).
- [ ] **Codex/agents as build tool** — short narrative of the plans/lanes workflow (rubric:
      Uso de OpenAI + Codex, 25 pts).

## Task 2: Cosmetic drift cleanup

- [ ] `docs/DATA-MODEL.md` §7 — seed coords still show Manta; update to Portoviejo
      (`-1.05458,-80.45445`) and the lng/lat DTO note.
- [ ] `docs/ARCHITECTURE.md` + README — replace the old single-root layout with
      `frontend/` + `backend/` paths.

## Task 3: Final read-through

- [ ] Read the README top-to-bottom as a judge with the rubric next to it
      (Producto 30 · OpenAI+Codex 25 · Técnica 20 · Demo 15 · Impacto 10). Fix gaps.
