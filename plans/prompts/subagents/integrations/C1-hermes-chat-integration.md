# C1 subagent wrapper — Hermes chat integration

Implement `plans/integrations/C1-hermes-chat-integration.md` within Person C's carve-out.

Do not edit migrations, `plans/CONTRACT.md`, frontend files, or backend barrels. Preserve the
frozen SOS body. Authenticate SOS and opt-in callers; require `x-pulso-webhook-secret` for the
database webhook; never expose service-role or webhook secrets.

Run root `npm run typecheck` after repo changes. Return changed files, requested exports,
verification results, and which VM/cloud steps remain blocked on C2 or "B1+B6 frozen".
