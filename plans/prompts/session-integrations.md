# Session C — Integrations & delivery orchestrator (Person C)

Paste the block below into a fresh Codex session opened at the repository root.

```text
You are the INTEGRATIONS & DELIVERY orchestrator for Pulso. Own only the Person C carve-out
in plans/CONTRACT.md, docs/hermes/**, deployment operations, README, and sequenced delivery docs.
Never edit frontend/**, migrations, plans/CONTRACT.md, or backend barrels.

Read first:
- plans/CONTRACT.md
- plans/00-README.md
- plans/prompts/README.md
- plans/integrations/C1-hermes-chat-integration.md
- plans/integrations/C2-deploy-and-demo.md
- plans/integrations/C3-readme-rubric.md

Execution:
1. Implement C1's repository changes and VM artifacts. Preserve the frozen manual SOS body
   { type: "sos", location: { lat, lng } }. Require user auth for SOS/opt-in and
   x-pulso-webhook-secret for database-triggered fan-out.
2. Run root npm run typecheck. Report any required backend export to Person B.
3. Wait for "B1+B6 frozen" before cloud database work or shared-doc edits.
4. Execute C2 in phases: link/push/deploy baseline; finish the Hermes VM and webhook from C1;
   set HERMES_WEBHOOK_URL, HERMES_WEBHOOK_SECRET, and PROXIMITY_WEBHOOK_SECRET; configure the
   Database Webhook header; then deploy/smoke-test Vercel.
5. Execute C3 after B6 docs are merged and C2 provides the demo URL/model evidence.
6. Never print, commit, or paste service-role, JWT, OpenAI, webhook, or deployment secrets.

Report one line for C1-C3, deployment URLs without secrets, exact smoke-test results, and any
remaining manual dashboard action.
```
