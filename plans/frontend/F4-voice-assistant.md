# F4 — Voice Assistant "Cerca" Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**` only).
**Goal:** The "Cerca" voice agent: the browser gets an ephemeral secret from
`create-realtime-session`, opens WebRTC straight to OpenAI Realtime, and bridges the model's
tool calls to the Supabase `agent-tools` function (injecting the user's real location) so answers
come only from real incident data.
**Depends on:** B4 (`create-realtime-session` + `agent-tools`); the CONTRACT stubs let this run
before B4 is finished.
**Reads from CONTRACT:** §4 (`create-realtime-session`, `agent-tools`), §5 (tool contracts + the
bridge flow).

## Global Constraints (apply to every task)
- No hardcoded config — `config` reads only `NEXT_PUBLIC_*` (Supabase URL/anon key, functions URL).
- One component/module per file; import from `@/components`, `@/lib`, and type-only from `@pulso/core`.
- UI copy in Spanish. Comments/commits → English.
- The real OpenAI key never reaches the browser (only the ephemeral `clientSecret`). The model
  never supplies coordinates — the bridge injects the user's location.

**Scaffold reality (verified):** this feature is nearly complete — `frontend/lib/realtime-agent.ts`
(mint → WebRTC → mic → data channel → tool bridge), `frontend/lib/realtime-tools.ts`
(`REALTIME_TOOLS`), `frontend/components/RealtimeAssistant.tsx` (status + transcript + talk
button), and `frontend/app/(app)/assistant/page.tsx` (mounts the component) all exist and work.
This plan closes ONE load-bearing bug and verifies the flow. **The load-bearing bug:** the bridge
injects tool args as `user_lat`/`user_long`, but B4's `agent-tools` reads `lat`/`lng` (CONTRACT §5
says the frontend injects `{ lat, lng }`). Left unfixed, every `get_nearby_incidents` call returns
"lat/lng requeridos".

**FRs covered:** FR-12 (ephemeral secret; key server-side), FR-13 (answers via tools, never
invents), FR-14/FR-15 (nearby + details tools), FR-16 (server derives user from JWT).

---

### Task 1: Inject the tool location as `lat`/`lng` (match agent-tools + CONTRACT §5)

**Files:**
- Modify: `frontend/lib/realtime-agent.ts` (the `runTool` helper)

**Interfaces:**
- Consumes: `agent-tools` expects `arguments: { ...modelArgs, lat, lng }` for `get_nearby_incidents`
  (B4 reads `args.lat`/`args.lng`).
- Produces: no signature change; only the injected key names change.

- [ ] **Step 1: Change the injected keys in `runTool`**

Replace the `body: JSON.stringify({ … })` inside `runTool` with:

```ts
    body: JSON.stringify({
      tool: toolName,
      // The bridge injects the user's real location (never the model). agent-tools reads
      // lat/lng (CONTRACT §5); only get_nearby_incidents uses them, extra keys are ignored.
      arguments: { ...args, lat: location.lat, lng: location.long },
    }),
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/realtime-agent.ts
git commit -m "fix(assistant): inject tool location as lat/lng to match agent-tools (CONTRACT §5)"
```

---

### Task 2: Confirm the tool contracts and page mount are intact

No code change expected — this task is a guard so a future edit doesn't drift the names.

**Files:**
- Verify: `frontend/lib/realtime-tools.ts`, `frontend/app/(app)/assistant/page.tsx`, `frontend/lib/index.ts`

- [ ] **Step 1: Confirm `REALTIME_TOOLS` names/keys match CONTRACT §5**

Open `frontend/lib/realtime-tools.ts` and confirm exactly:
`get_nearby_incidents({ radius_meters?, filter_category? })`,
`get_incident_details({ incident_id })`, `confirm_incident({ incident_id, kind })`. These must
stay byte-identical to B4's server copy (`create-realtime-session/tools.ts`). Do NOT add lat/lng
here — the model never supplies location; the bridge injects it (Task 1).

- [ ] **Step 2: Confirm the route mounts the component**

Open `frontend/app/(app)/assistant/page.tsx`; it renders `<RealtimeAssistant />` from
`@/components`. No change needed.

- [ ] **Step 3: Commit** (only if you had to correct a drift)

```bash
git commit --allow-empty -m "chore(assistant): confirm tool contracts + route mount align with CONTRACT §5"
```

---

### Task 3: Verify the voice flow end-to-end

**Files:** none (verification only). Requires B4 deployed/served and B1's seed present.

- [ ] **Step 1: Run the app**

Run: `cd frontend && npm run dev` → open http://localhost:3000 on a phone or a mic-enabled browser,
sign in, then go to the **Cerca** tab.

- [ ] **Step 2: Start a session and grant mic + location**

Tap **"Hablar con Cerca"**. Expected: status goes `Conectando…` → `En vivo`; the browser prompts
for microphone and location; the orb pulses.

- [ ] **Step 3: Ask about nearby incidents**

Say: *"¿Qué está pasando cerca de mí?"*
Expected: a `→ get_nearby_incidents` tool chip appears, then Cerca answers **in Spanish** using the
seeded incidents (e.g. mentions the accident/flood/fire near the venue) — it does not invent
incidents. Ask a follow-up (*"cuéntame más del accidente"*) → a `→ get_incident_details` chip,
then details. This proves FR-13/FR-14/FR-15.

- [ ] **Step 4: Confirm no secret leaked**

In DevTools → Network, the `create-realtime-session` response contains a `clientSecret`
(`ek_…`), and the WebRTC handshake uses it — the real `OPENAI_API_KEY` never appears (FR-12).

- [ ] **Step 5: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(assistant): Cerca voice flow verified end-to-end against seed"
```

---

## Notes / optional hardening
- `realtime-agent.ts` posts the WebRTC offer to the configured
  `https://api.openai.com/v1/realtime/calls` SDP endpoint. The URL is public (not a secret),
  while the ephemeral client secret authorizes the request.
- `RealtimeAssistant.start()` already sets `status="error"` if mic/location is denied; the button
  then reads "Error — reintentar". No change required for the demo.

## Self-review notes
- **Coverage:** FR-12 ✓ (ephemeral secret), FR-13 ✓ (tool-only answers), FR-14/FR-15 ✓ (both
  tools), FR-16 ✓ (server derives user from JWT).
- **Contract:** bridge injects `{ lat, lng }` (matches B4 `agent-tools`); tool names/keys per §5.
- **Lane:** only `frontend/**`.
