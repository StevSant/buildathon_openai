# Supabase Project Deployment Design

## Objective

Configure the Pulso repository for the Supabase project already connected through MCP and deploy the checked-in database and Edge Function backend. The result must be usable by the Next.js frontend, reproducible from source, and free of committed secrets.

## Current State

- The connected project is `xtppgwxsqzjrxqyrqrit` and currently has no `public` tables, migrations, or Edge Functions.
- The repository uses imperative SQL migrations in `backend/supabase/migrations/`.
- Five Edge Functions exist under `backend/supabase/functions/`.
- The Supabase CLI is not installed, while the authenticated Supabase MCP tools are available.
- The frontend expects its Supabase URL and public client key through ignored Next.js environment configuration.

## Chosen Approach

Use Supabase MCP as the deployment path. Apply the existing migrations in order, seed the demo data, deploy the five Edge Functions, and verify the remote state with MCP queries and advisors. Create an ignored `frontend/.env.local` from the public project values returned by MCP.

This is preferred over installing the CLI because MCP is already authenticated and the user explicitly requested it. A configuration-only approach is insufficient because the user authorized full remote deployment.

## Local Configuration

Create two ignored local environment files:

- `frontend/.env.local` contains the connected project URL, the active modern publishable key supplied by MCP, and all browser-safe map, venue, radius, alert, locale, and OpenAI Realtime endpoint defaults documented in `frontend/.env.local.example`.
- `backend/supabase/.env.local` contains the OpenAI key, generated cédula pepper, optional integration variables, and server-side defaults used for local Edge Function development.

No service-role key, OpenAI key, identity pepper, or Hermes credential may appear in frontend files or tracked configuration. Local Edge Functions must be served with the backend file explicitly, for example with `supabase functions serve --env-file .env.local` from `backend/supabase`.

Retain the existing `backend/supabase/config.toml` service layout and function JWT settings. The Supabase CLI stores remote link metadata separately from `project_id`, so remote deployment through MCP does not require changing the local project identifier.

## Database Deployment

Before applying the initial migration, add `WITH CHECK` ownership predicates to the `profiles` and `incidents` update policies. This prevents an authorized updater from changing an ownership column to another user and aligns the migration with Supabase's current RLS guidance.

Apply the checked-in migrations in this order:

1. `0001_init.sql` as `init`;
2. `0002_whatsapp_sos.sql` as `whatsapp_sos`.

Then execute `backend/supabase/seed.sql` as seed data rather than recording it as schema migration history. The migrations create PostGIS-backed tables, RPCs, RLS policies, and the public `report-photos` storage bucket.

## Edge Function Deployment

Deploy these functions from their checked-in entrypoints and include every relative dependency plus the shared Deno configuration:

- `verify-identity` with JWT verification enabled;
- `analyze-report` with JWT verification enabled;
- `create-realtime-session` with JWT verification enabled;
- `agent-tools` with JWT verification enabled;
- `proximity-dispatcher` with JWT verification disabled because it is designed for a trusted database webhook and performs its own controlled backend work.

No database webhook will be created until Hermes is configured. Deploying `proximity-dispatcher` is still useful and keeps the remote backend aligned with source, but it will remain dormant.

## Secrets

The user supplied `OPENAI_API_KEY` in the conversation. It must be entered only into Supabase Edge Function secrets and must never be echoed, written to repository files, or included in command output.

Generate a cryptographically random `CEDULA_HASH_PEPPER` locally and place it only in Supabase Edge Function secrets. The value must not be displayed or persisted in tracked files.

Hermes variables are optional and remain unset until the integration lane is ready:

- `HERMES_WEBHOOK_URL`;
- `HERMES_WEBHOOK_SECRET`;
- `PROXIMITY_WEBHOOK_SECRET`.

The identity registry URL and key are also optional; their absence selects the existing algorithmic fallback. Supabase runtime variables such as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

Because the available Supabase MCP surface does not expose secret management, use the authenticated Supabase dashboard only for the secrets operation. Do not place secrets in SQL, Vault, migration files, or client configuration.

## Verification

After deployment:

1. List remote migrations and confirm both expected entries.
2. List `public` tables with columns and constraints.
3. List all deployed Edge Functions and confirm each JWT setting.
4. Execute read-only SQL checks for expected tables, RLS enablement, RPCs, storage bucket, and seed row counts.
5. Generate TypeScript database types and store them as a tracked source artifact if they are compatible with the current frontend.
6. Run Supabase security and performance advisors and resolve deployment-caused findings.
7. Run repository type checking and build checks after local configuration changes.

The deployment is complete only when the remote checks pass and no required secret is present in Git status or tracked files.

## Failure Handling

- If a migration fails, inspect the database state before retrying; do not blindly reapply DDL.
- If an Edge Function bundle fails, inspect its import graph and redeploy only after correcting the uploaded file set.
- If dashboard secret configuration is unavailable, complete and verify all non-secret deployment work, then report that single external blocker without exposing the credential.
- Preserve all unrelated uncommitted user changes in the worktree.

