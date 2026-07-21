import assert from "node:assert/strict";
import test from "node:test";

import { readVerifiedIdentityResponse } from "../frontend/lib/identity-verification.ts";

test("rejects an HTTP 200 identity denial", async () => {
  const response = Response.json({ verified: false, reason: "Cédula inválida" });

  await assert.rejects(() => readVerifiedIdentityResponse(response), /Cédula inválida/);
});

test("uses the error envelope from a non-success response", async () => {
  const response = Response.json({ error: "Cédula duplicada" }, { status: 409 });

  await assert.rejects(() => readVerifiedIdentityResponse(response), /Cédula duplicada/);
});

test("accepts only an explicitly verified identity", async () => {
  await readVerifiedIdentityResponse(Response.json({ verified: true }));
});
