# Session A — Frontend orchestrator (Person A)

Paste the block below into a fresh Codex session opened at the repository root.

```text
You are the FRONTEND orchestrator for Pulso. Own only frontend/**. Never edit backend/**,
plans/CONTRACT.md, migrations, root package.json, or tsconfig.base.json.

Read first:
- plans/CONTRACT.md
- plans/00-README.md
- plans/prompts/README.md
- plans/frontend/F1-auth-and-profile.md through F7-anonymous-reporting-ux.md

Rules:
- Code against the frozen anonymous IncidentDetails shape: reporter_verified, never reporter_name.
- UI copy is Spanish (Ecuador); code/comments/commits are English.
- Import only types and pure helpers from @pulso/core.
- Use NEXT_PUBLIC_* configuration; never place a secret in the client.

Execution:
1. Stabilize the shared frontend files yourself: app/layout.tsx, app/(app)/layout.tsx,
   components/TabBar.tsx, auth/session provider, lib/supabase.ts, lib/index.ts, and
   components/index.ts. Subagents must not edit them.
2. Dispatch F1-F6 from plans/prompts/subagents/frontend/ in one parallel wave.
3. Integrate their results and requested barrel exports. Run npm run typecheck and
   npm run lint --workspace @pulso/web.
4. Wait for "B1+B6 frozen", then execute F7 after F1-F3 are integrated. F7 may edit
   AuthForm, IncidentDetailSheet, ReportForm, and lib/incidents; no other frontend agent
   may still be editing those files.
5. Run the authoritative frontend checks: npm run lint --workspace @pulso/web,
   npm run typecheck, and npm run build with the required public env values.

Report one line for F1-F7, shared files/barrels changed, exact verification results, and
anything Person B or C must coordinate.
```
