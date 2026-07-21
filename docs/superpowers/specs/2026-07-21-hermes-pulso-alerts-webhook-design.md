# Hermes `pulso-alerts` Webhook Configuration Design

**Date:** 2026-07-21  
**Status:** Approved

## Objective

Configure Pulso's Supabase `proximity-dispatcher` to send direct-delivery WhatsApp alerts to the
existing Hermes subscription at `/webhooks/pulso-alerts`. Requests must carry the subscription's
expected `{text}` value and use Hermes' generic V2 HMAC-SHA256 authentication.

## Scope

- Replace the fictional Hermes WhatsApp REST-send contract with the real webhook contract.
- Store the real webhook URL and secret only in a gitignored local `.env`.
- Keep tracked environment templates safe by using placeholders.
- Generate deterministic Spanish alert text in Pulso because this Hermes route uses direct
  delivery and does not invoke an agent.
- Preserve recipient fan-out through the existing `MessagingGateway` port.
- Add request identifiers so Hermes can suppress duplicate retries.

The inbound Hermes agent and VM-side MCP bridge are outside this configuration task.

## Architecture and Data Flow

1. `proximity-dispatcher` receives an incident or SOS event.
2. The core dispatch use case resolves accepted emergency contacts.
3. Pulso creates the final Spanish WhatsApp message for each event.
4. `HermesWhatsAppGateway` serializes one stable JSON body containing `text`, `to`, and `kind`.
5. The gateway creates a Unix timestamp and signs `<timestamp>.<raw-body>` with the webhook secret
   using HMAC-SHA256.
6. The gateway POSTs the exact signed bytes to Hermes with:
   - `Content-Type: application/json`
   - `X-Webhook-Timestamp: <unix-seconds>`
   - `X-Webhook-Signature-V2: <lowercase-hex-digest>`
   - `X-Request-ID: <unique-id>`
7. Hermes validates the signature, renders `{text}`, and delivers the message through WhatsApp
   without an LLM run.

The `to` field remains in the payload for subscriptions whose WhatsApp `chat_id` is templated as
`{to}`. If the subscription instead uses a configured WhatsApp home channel, Hermes safely ignores
the extra field.

## Components

### Environment contract

The backend reads:

- `HERMES_WEBHOOK_URL`
- `HERMES_WEBHOOK_SECRET`

The real values live in the root `.env`, which is ignored by Git. `.env.example` documents only
placeholder values. Obsolete `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WHATSAPP_FROM`, and
WhatsApp-template variables are removed from the active contract.

### Messaging port and use case

`MessagingGateway.sendWhatsApp` accepts a recipient, event kind, and final text. The core dispatch
use case retains its accepted-contact filtering and sends one request per contact. It does not know
about HTTP headers, HMAC, or Hermes-specific response bodies.

### Hermes adapter

The adapter owns JSON serialization, V2 signing, HTTP transport, request IDs, and normalization of
Hermes' response (`delivery_id` and `status`) into the existing port result.

### Composition root

`proximity-dispatcher` reads the new environment values, constructs the adapter, and supplies the
direct-delivery Spanish copy. SOS text can include the supplied area when present; proximity text
is concise and directs recipients to Pulso for current incident details.

## Error Handling

- Missing webhook configuration produces the existing JSON error envelope before dispatch.
- A non-2xx Hermes response throws a status-only error without leaking response bodies or secrets.
- A failed recipient delivery remains isolated so other accepted contacts can still be attempted.
- Hermes' `X-Request-ID` idempotency prevents a retried request identifier from delivering twice.

## Verification

- Unit-level tests verify the exact V2 signature input and request headers with a mocked `fetch`.
- TypeScript typechecks verify the port, adapter, and core use case remain consistent.
- A repository secret scan verifies the supplied secret appears only in ignored local configuration.
- If a Hermes gateway is running and reachable from the execution environment, perform a signed
  smoke request; otherwise report that live delivery remains an external runtime check.

## Security Notes

- Never log or commit the webhook secret.
- V2 timestamp-bound signing is used instead of legacy body-only V1 signing to limit replay risk.
- The exact serialized body sent over HTTP is the body included in the HMAC calculation.
- `localhost:8644` is reachable only from the same host or network namespace as Hermes. A deployed
  Supabase Edge Function will require a network-reachable HTTPS URL or private tunnel; the local URL
  is suitable for local execution on the Hermes host.
