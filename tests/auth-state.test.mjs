import assert from "node:assert/strict";
import test from "node:test";

import { authDestination } from "../frontend/lib/auth-state.ts";

test("routes a missing session to auth", () => {
  assert.equal(authDestination(null), "/auth");
  assert.equal(authDestination(undefined), "/auth");
  assert.equal(authDestination({ user: null }), "/auth");
});

test("keeps an authenticated session inside the app", () => {
  assert.equal(authDestination({ user: { id: "user-1" } }), null);
});
