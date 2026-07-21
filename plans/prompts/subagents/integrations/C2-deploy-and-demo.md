# C2 operator wrapper — deploy and demo

Execute `plans/integrations/C2-deploy-and-demo.md` only after "B1+B6 frozen" and the relevant
C1 repository changes exist.

This task owns dashboards, CLIs, secrets, and deployment state only. Do not edit migrations,
application code, or the frozen contract. Never echo or commit credentials. Configure the
incident Database Webhook with `x-pulso-webhook-secret`.

Return sanitized deployment URLs, observable smoke-test results, and any manual action still
required. Never return secret values.
