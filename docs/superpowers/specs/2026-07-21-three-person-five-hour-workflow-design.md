# Three-Person, Five-Hour GitHub Workflow Design

**Date:** 2026-07-21  
**Status:** Approved for implementation planning

## Objective

Enable three teammates on separate computers to work in the same GitHub repository for a
five-hour build sprint without editing the same files concurrently. The workflow must maximize
parallel delivery while preserving one stable frontend-to-backend contract and leaving enough
time to deploy, rehearse, and recover from integration problems.

## Chosen approach

Use three file-owned lanes:

| Lane | Owner | Exclusive scope |
|---|---|---|
| Frontend | Person A | `frontend/**` |
| Backend | Person B | Supabase, core, and adapter code under `backend/**`, except Person C's messaging carve-out |
| Integrations and delivery | Person C | Hermes/WhatsApp messaging carve-out, deployment operations, demo preparation, and final delivery documentation |

This follows the repository's existing frontend/backend boundaries and gives one person explicit
ownership of deployment and demo readiness. End-to-end feature ownership was rejected because
multiple people would need to edit migrations, environment contracts, barrels, and shared
functions. A serialized team swarm was rejected because it would leave two people waiting during
most of a short sprint.

## Ownership boundaries

Person A may edit only `frontend/**` during parallel work.

Person B owns:

- `backend/supabase/**`
- `backend/core/**`
- `backend/adapters/**`
- `plans/CONTRACT.md` during the bootstrap gate
- database-facing canonical documentation during that gate

Person C owns this explicit carve-out from Person B's directories:

- `backend/core/ports/messaging-gateway.ts`
- `backend/core/use-cases/dispatch-proximity-alerts.ts`
- `backend/adapters/messaging/**`
- `backend/supabase/functions/proximity-dispatcher/**`
- Hermes-specific configuration entries in shared environment files
- `docs/hermes/**`
- Supabase Cloud, Hermes VM, and Vercel deployment operations
- final README, architecture evidence, demo, and rubric documentation after the backend gate

Person B owns backend barrel files. If Person C needs a new export, Person C reports it and Person
B applies the barrel edit. Root configuration and lock files are frozen during the sprint unless
all three people explicitly agree on one owner before the edit begins.

## GitHub protocol

All teammates begin from the same committed `main` revision and use one persistent lane branch:

- `sprint/frontend`
- `sprint/backend`
- `sprint/integrations`

No teammate commits directly to `main`. Commits remain small and use Conventional Commit messages
in English. Each pull request identifies the plan IDs it completes and lists verification performed.

The only mandatory synchronization gate is **B1+B6 frozen**:

1. Person B completes the B1 schema work and B6 anonymity/abuse-contract work back-to-back.
2. Person B opens and merges the bootstrap pull request.
3. Person B posts the exact phrase `B1+B6 frozen` with the merged commit SHA in the team channel.
4. Persons A and C fetch `main` and merge it into their lane branches before starting work that
   depends on the final schema, anonymous incident contract, or deployed backend.

Pull requests from file-disjoint lanes may merge independently after this gate. Shared documentation
is edited sequentially: Person B finishes its canonical database updates first; Person C performs
the final evidence and drift pass later. A teammate who needs an out-of-lane edit must ask the file
owner and wait for acknowledgement. The owner either makes the edit or explicitly transfers that
single file for the duration of the change.

## Five-hour execution schedule

### 00:00-00:15 — kickoff

- Confirm `main` is green and record its commit SHA.
- Create the three lane branches.
- Confirm environment access for Supabase, Vercel, Hermes, and OpenAI.
- Paste one lane-specific session prompt into each teammate's Codex session.
- Person B starts B1+B6 immediately; Persons A and C start only gate-independent work.

### 00:15-01:00 — bootstrap and independent work

- Person B completes and merges B1+B6, then announces `B1+B6 frozen`.
- Person A works on F1-F6 surfaces that use the frozen documented contract or local stubs.
- Person C works on C1 messaging code and the Hermes MCP shim without deploying database-dependent
  pieces.

### 01:00-03:15 — maximum parallel implementation

- Person A completes the highest-value frontend demo path, then F7.
- Person B completes B2-B4; B5 remains retired because C1 supersedes it.
- Person C completes C1 and begins C2 deployment as backend functions become available.
- Each lane opens small pull requests as coherent units become verifiable.

### 03:15-04:00 — integration freeze

- Stop starting optional features.
- Merge required pull requests and update every lane from `main`.
- Run repository-wide typechecking, linting, and the production frontend build.
- Person C verifies cloud configuration and the deployed end-to-end path.

### 04:00-04:40 — demo rehearsal and fixes

- Rehearse the exact demo in `docs/DEMO.md` on the deployed URL.
- Fix only critical demo blockers, security failures, or contract mismatches.
- Person C records final deployment evidence and aligns delivery documentation.

### 04:40-05:00 — final freeze

- Stop code changes except for a single explicitly assigned blocker.
- Re-run affected verification after the last change.
- Confirm the demo URL, fallback path, presenter roles, and known limitations.
- Tag or record the final demo commit SHA.

## Plan allocation

Person A executes F1-F6 and then F7. The demo-critical order is authentication/profile, live map,
reporting, voice assistant, notifications, safety/SOS, then anonymous-reporting polish.

Person B executes B1 and B6 as one bootstrap gate, then B2-B4. B5 is retired and must not be
dispatched because its responsibility belongs to C1.

Person C executes C1, C2, and C3. C1 code that does not depend on the final schema may begin at
kickoff. C1 deployment checks and C2 database work wait for the bootstrap gate. C3 may prepare
structure early, but its final evidence pass waits for B6 documentation and C2 deployment outputs.

If time slips, each person finishes the currently working demo path before beginning lower-priority
polish. No lane expands its scope to compensate for another lane without an explicit ownership
handoff.

## Coordination and failure handling

GitHub pull requests are the source of truth for code review and integration status. The team uses
one lightweight chat channel for gate announcements and blockers. Status messages use a compact
format: `[lane] plan — state — blocker/next action`.

Merge conflicts are resolved by the owner of the conflicted file. The other contributor explains
the intended behavior but does not resolve or force-push over the owner's work. If a shared contract
must change after the gate, work pauses at that seam, Person B proposes the exact contract change,
all three acknowledge it, and one designated owner updates the contract and dependent call sites
in a sequenced set of pull requests.

External deployment failures do not authorize unplanned architecture changes. Person C records the
failure, uses the documented demo fallback where available, and asks the responsible lane owner for
the smallest required code correction. Secrets remain in the relevant provider or local untracked
environment file and never enter commits, logs, screenshots, or chat messages.

## Verification and completion criteria

Before the integration freeze is declared complete:

- `git diff --check` passes for each pull request.
- Frontend linting passes.
- Repository-wide TypeScript typechecking passes.
- The production frontend build passes with non-secret public configuration.
- Available Supabase/Deno checks pass; unavailable local tooling is reported explicitly.
- The deployed demo path is rehearsed from sign-in through the primary reporting/map flow.
- Hermes/WhatsApp and voice paths are exercised if their credentials and external services are
  available; otherwise their documented fallback is rehearsed.
- No active prompt or execution plan tells the team to use two lanes or dispatch retired B5.
- Every shared file has exactly one owner at the time it is edited.

The workflow implementation is complete when the task board, contract, three session prompts,
subagent wrappers, project documentation, and environment examples all describe this same lane
model and dependency gate without contradictory instructions.
