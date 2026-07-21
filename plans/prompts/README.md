# Pulso — Three-person parallel execution prompts

Ready-to-paste prompts for three concurrent Codex sessions, one teammate per owned lane.
All sessions read the frozen seam in `plans/CONTRACT.md`; no session may widen its file
ownership without a three-person sync.

## Kickoff

1. Start all three sessions from the same committed baseline.
2. Person B runs B1 then B6 as the bootstrap gate and announces **"B1+B6 frozen"**.
3. Person A may run F1-F6 while the gate is in progress because they code against the already
   approved target contract. F7 waits for both the gate and F1-F3 because it edits their files.
4. Person C may implement C1's repo/VM artifacts while the gate runs. Cloud database work,
   shared-doc edits, and final delivery checks wait for the stated dependencies.

| Person | Session prompt | Lane |
|---|---|---|
| A | [`session-frontend.md`](session-frontend.md) | `frontend/**` |
| B | [`session-backend.md`](session-backend.md) | backend excluding the messaging carve-out |
| C | [`session-integrations.md`](session-integrations.md) | messaging carve-out, Hermes, deploy, delivery docs |

## Safe fan-out

### Frontend

The frontend orchestrator first owns shared layouts, providers, TabBar, Supabase client, and
barrels. It may then dispatch F1-F6 together because their feature files are disjoint. F7 runs
after F1-F6 integration because it deliberately revisits F1/F2/F3 files.

### Backend

B1 and B6 run sequentially. After the **B1+B6 frozen** announcement, B2-B4 may run together.
Person B owns backend barrels and shared backend configuration, except Hermes keys in
`_shared/env.ts`, which belong to Person C after the gate.

### Integrations & delivery

C1-C3 are not a blind parallel fan-out:

1. Implement C1 repo changes and VM artifacts.
2. After B1+B6, use C2 to link/push/deploy the cloud baseline.
3. Finish C1 VM/WhatsApp/webhook setup, then set the Hermes and proximity webhook secrets.
4. Finish C2's Vercel/demo checks.
5. Run C3's final README/evidence pass after B6 docs and C2 outputs exist.

## Collision rules

- Never edit `plans/CONTRACT.md` after the B1+B6 freeze without all three people agreeing.
- Person C never edits migrations. The incident webhook is configured in Supabase Dashboard
  with `x-pulso-webhook-secret`.
- Person B owns backend barrels. Person C reports any new export instead of editing a barrel.
- Person C edits `docs/DECISIONS.md` and `docs/DATA-MODEL.md` only after B6 completes.
- Each orchestrator runs its lane verification before handoff. The final integrator runs root
  typecheck, frontend lint/build, and available Supabase/Deno checks.

## Retired work

`plans/backend/B5-proximity-dispatcher.md` and its former wrapper are retired. C1 supersedes
the old Hermes REST/template approach; never dispatch B5.
