# Three-Person Workflow Recovery Implementation Plan

> **For agentic workers:** Continue the two interrupted review sessions without committing. Keep the approved lane choice: Frontend, Backend, and Integrations & Delivery.

**Goal:** Finish the interrupted consistency review and make every execution document describe one coherent three-person workflow.

**Architecture:** Person A owns `frontend/**`; Person B owns backend files except the explicit messaging carve-out; Person C owns that carve-out plus Hermes, delivery, and rubric documentation. `plans/CONTRACT.md` remains the frozen cross-lane seam, with B1+B6 as the bootstrap gate.

**Tech Stack:** Markdown execution plans, Next.js/TypeScript verification, Supabase Edge Functions and migrations.

## Global Constraints

- Do not commit, push, deploy, or mutate remote services.
- Preserve the user-approved Integrations & Delivery lane.
- Preserve the existing SOS request shape `{ type: "sos", location: { lat, lng } }` across frontend, contract, and C1.
- Shared files must have an explicit owner or sequencing rule; do not claim they can be edited concurrently.
- Treat scaffolded plan work as pending work, not as a defect to implement during this documentation repair.

---

### Task 1: Freeze the authoritative three-lane contract

**Files:**
- Modify: `plans/00-README.md`
- Modify: `plans/CONTRACT.md`

- [ ] Make B1+B6 the single bootstrap gate.
- [ ] Define the Person C messaging carve-out and shared-file sequencing precisely.
- [ ] Replace two-person language and the legacy Hermes environment contract.
- [ ] Preserve the current SOS body so F6 and C1 agree.

### Task 2: Repair the plan dependency graph

**Files:**
- Modify: `plans/integrations/C1-hermes-chat-integration.md`
- Modify: `plans/integrations/C2-deploy-and-demo.md`
- Modify: `plans/integrations/C3-readme-rubric.md`
- Modify: `plans/backend/B1-schema-rls-rpc-seed.md`
- Modify: `plans/backend/B5-proximity-dispatcher.md`
- Modify: `plans/backend/B6-anonymous-reports-abuse-gate.md`
- Modify: `plans/frontend/F5-notifications.md`
- Modify: `plans/frontend/F6-safety-whatsapp-sos.md`

- [ ] Mark B5 as retired and route all consumers to C1.
- [ ] Correct C1 typecheck commands, SOS shape, nearby-tool coordinates, and VM secret contract.
- [ ] Remove C2's migration-edit exception and use the realtime model for realtime verification.
- [ ] Sequence C3 after B6/C2 where it consumes their outputs; remove already-fixed cleanup claims.
- [ ] Replace remaining Manta test coordinates and stale two-lane dependency wording.

### Task 3: Complete the three-session prompt kit

**Files:**
- Modify: `plans/prompts/README.md`
- Modify: `plans/prompts/session-frontend.md`
- Modify: `plans/prompts/session-backend.md`
- Create: `plans/prompts/session-integrations.md`
- Modify: `plans/prompts/subagents/backend/B5-proximity-dispatcher.md`
- Create: `plans/prompts/subagents/integrations/C1-hermes-chat-integration.md`
- Create: `plans/prompts/subagents/integrations/C2-deploy-and-demo.md`
- Create: `plans/prompts/subagents/integrations/C3-readme-rubric.md`

- [ ] Describe three orchestrators and the B1+B6 coordination gate.
- [ ] Add F7 to the frontend lane, B6 to the backend gate, and C1-C3 to Person C.
- [ ] Prevent retired B5 from being dispatched.
- [ ] Give every wrapper exact ownership, verification, and return-summary rules.

### Task 4: Synchronize project and Hermes documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/HERMES-CHAT-INTEGRATION.md`
- Modify: `docs/hermes/.env.example`
- Modify: `docs/hermes/config.yaml.example`
- Modify: `frontend/.env.local.example`

- [ ] Replace two-person architecture language with the approved lanes.
- [ ] Align build-day roles and real paths with the lane plan.
- [ ] Document `SUPABASE_SERVICE_ROLE_KEY` as a server-only VM secret and pass it to the MCP shim.
- [ ] Remove the unused `PULSO_MCP_TOKEN` instruction.
- [ ] Correct Supabase command working directories and stale seed paths.

### Task 5: Verify the recovered work

- [ ] Search for stale two-lane, B5-dispatch, legacy Hermes, Manta, and wrong-path references.
- [ ] Run `git diff --check` and review the complete uncommitted diff.
- [ ] Run `npm run lint --workspace @pulso/web`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build` with non-secret placeholder public environment values.
- [ ] Report Deno/Supabase-runtime verification as unavailable if the required local tools are absent.
