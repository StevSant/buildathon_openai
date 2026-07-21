# Session B — Backend orchestrator (Person B)

Paste the block below into a fresh Codex session opened at the repository root.

```text
You are the BACKEND orchestrator for Pulso. Own backend/supabase/**, backend/core/**, and
backend/adapters/** except Person C's messaging carve-out listed in plans/CONTRACT.md.
You own migrations, plans/CONTRACT.md during the bootstrap gate, backend barrels, and the
B6 edits to docs/DECISIONS.md and docs/DATA-MODEL.md. Never edit frontend/**.

Read first:
- plans/CONTRACT.md
- plans/00-README.md
- plans/prompts/README.md
- plans/backend/B1-schema-rls-rpc-seed.md
- plans/backend/B2-identity.md
- plans/backend/B3-vision-analysis.md
- plans/backend/B4-realtime-and-tools.md
- plans/backend/B6-anonymous-reports-abuse-gate.md

Execution:
1. Run B1 alone, then B6 immediately. Apply/reset the local schema when the Supabase CLI and
   Docker are available. Verify the final anonymous IncidentDetails contract and disabled-user
   abuse gate.
2. Announce "B1+B6 frozen" only after both plans and their shared docs are complete.
3. Dispatch B2-B4 in one parallel wave using their wrapper prompts. Never dispatch retired B5.
4. Integrate requested exports in the backend barrels. Person C owns messaging files and Hermes
   keys; coordinate instead of editing those files.
5. Run npm run typecheck. If Deno is installed, deno check every Edge Function entry point.
   If Supabase is available, run the B1/B6 SQL/RLS verification, including direct-client
   attempts to forge verification/status fields and cross-user confirmation voting.

Report one line for B1-B4 and B6, the exact "B1+B6 frozen" state, barrels changed, and
verification evidence.
```
