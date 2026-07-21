import assert from "node:assert/strict";
import test from "node:test";

import { makeDispatchProximityAlerts } from "../backend/core/use-cases/dispatch-proximity-alerts.ts";

test("continues alert fan-out after an individual gateway failure", async () => {
  const attempts = [];
  const contacts = [
    { id: "contact-1", ownerId: "user-1", name: null, phone: "+593000000001", status: "accepted", createdAt: "2026-07-21" },
    { id: "contact-2", ownerId: "user-1", name: null, phone: "+593000000002", status: "accepted", createdAt: "2026-07-21" },
    { id: "contact-3", ownerId: "user-1", name: null, phone: "+593000000003", status: "accepted", createdAt: "2026-07-21" },
  ];

  const dispatch = makeDispatchProximityAlerts({
    incidents: { findAlertRecipients: async () => [] },
    profiles: { getEmergencyContacts: async () => contacts },
    messaging: {
      async sendWhatsApp({ to }) {
        attempts.push(to);
        if (to === "+593000000002") throw new Error("Hermes unavailable");
        return { id: `message-${to}`, status: "sent" };
      },
    },
  });

  const result = await dispatch({
    kind: "sos",
    userId: "user-1",
    template: "pulso_sos",
  });

  assert.deepEqual(attempts, contacts.map((contact) => contact.phone));
  assert.equal(result.sent, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.results[1], { id: "contact-2", status: "failed" });
});
