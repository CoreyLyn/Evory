import assert from "node:assert/strict";
import test from "node:test";

import {
  getSecurityEventMetadataEntries,
  getSecurityEventRelatedAgent,
  getSecurityEventTypeLabel,
} from "./security-events-presenter";

test("getSecurityEventMetadataEntries sorts keys and stringifies nested values", () => {
  const entries = getSecurityEventMetadataEntries({
    retryAfterSeconds: 75,
    context: {
      reason: "burst",
      attempts: 6,
    },
    tags: ["claim", "retry"],
    empty: null,
    scope: "credential",
  });

  assert.deepEqual(entries, [
    {
      key: "context",
      value: '{"reason":"burst","attempts":6}',
    },
    {
      key: "empty",
      value: "null",
    },
    {
      key: "retryAfterSeconds",
      value: "75",
    },
    {
      key: "scope",
      value: "credential",
    },
    {
      key: "tags",
      value: '["claim","retry"]',
    },
  ]);
});

test("getSecurityEventRelatedAgent returns the managed agent when the event references one", () => {
  const relatedAgent = getSecurityEventRelatedAgent(
    {
      agentId: "agent-2",
      agentName: "Event Name",
    },
    [
      { id: "agent-1", name: "First Agent" },
      { id: "agent-2", name: "Owned Agent" },
    ]
  );

  assert.deepEqual(relatedAgent, {
    id: "agent-2",
    name: "Owned Agent",
    isManaged: true,
  });
});

test("getSecurityEventRelatedAgent falls back to the event-provided agent name", () => {
  const relatedAgent = getSecurityEventRelatedAgent(
    {
      agentId: "agent-9",
      agentName: "Missing Agent",
    },
    [{ id: "agent-1", name: "First Agent" }]
  );

  assert.deepEqual(relatedAgent, {
    id: "agent-9",
    name: "Missing Agent",
    isManaged: false,
  });
});

test("getSecurityEventTypeLabel returns readable labels for multiple security event classes", () => {
  assert.equal(getSecurityEventTypeLabel("RATE_LIMIT_HIT"), "Rate Limit");
  assert.equal(getSecurityEventTypeLabel("AUTH_FAILURE"), "Auth Failure");
  assert.equal(getSecurityEventTypeLabel("CSRF_REJECTED"), "CSRF Rejected");
  assert.equal(
    getSecurityEventTypeLabel("INVALID_AGENT_CREDENTIAL"),
    "Invalid Credential"
  );
  assert.equal(
    getSecurityEventTypeLabel("AGENT_ABUSE_LIMIT_HIT"),
    "Agent Abuse"
  );
});

test("getSecurityEventTypeLabel returns stable labels for new security event classes", () => {
  assert.equal(getSecurityEventTypeLabel("RATE_LIMIT_HIT"), "Rate Limit");
  assert.equal(getSecurityEventTypeLabel("AUTH_FAILURE"), "Auth Failure");
  assert.equal(getSecurityEventTypeLabel("CSRF_REJECTED"), "CSRF Rejected");
  assert.equal(
    getSecurityEventTypeLabel("INVALID_AGENT_CREDENTIAL"),
    "Invalid Credential"
  );
  assert.equal(
    getSecurityEventTypeLabel("AGENT_ABUSE_LIMIT_HIT"),
    "Agent Abuse"
  );
  assert.equal(getSecurityEventTypeLabel("SOMETHING_ELSE"), "SOMETHING_ELSE");
});
