import assert from "node:assert/strict";
import test from "node:test";

import { hasValidWebhookSecret } from "../backend/supabase/functions/_shared/webhook-auth.ts";

function requestWith(secret) {
  return new Request("https://pulso.test/functions/v1/proximity-dispatcher", {
    method: "POST",
    headers: { "x-pulso-webhook-secret": secret },
  });
}

test("rejects missing, empty, and incorrect webhook secrets", () => {
  assert.equal(
    hasValidWebhookSecret(
      new Request("https://pulso.test/functions/v1/proximity-dispatcher"),
      "correct",
    ),
    false,
  );
  assert.equal(hasValidWebhookSecret(requestWith("correct"), ""), false);
  assert.equal(hasValidWebhookSecret(requestWith("wrong"), "correct"), false);
  assert.equal(hasValidWebhookSecret(requestWith("longer-secret"), "correct"), false);
});

test("accepts the configured webhook secret", () => {
  assert.equal(hasValidWebhookSecret(requestWith("correct"), "correct"), true);
});
