import assert from "node:assert/strict";
import test from "node:test";
import { ActivityBubble, createBubble, updateBubbles } from "./bubbles";

test("createBubble returns a bubble with correct defaults", () => {
  const bubble = createBubble("agent-1", "posted", "New post title");
  assert.equal(bubble.agentId, "agent-1");
  assert.equal(bubble.action, "posted");
  assert.equal(bubble.text, "New post title");
  assert.ok(bubble.ttl > 0);
  assert.ok(bubble.opacity > 0);
});

test("updateBubbles decrements ttl and removes expired", () => {
  const bubbles: ActivityBubble[] = [
    createBubble("a1", "posted", "Hi"),
    { ...createBubble("a2", "claimed", "Task"), ttl: 1 },
  ];
  const result = updateBubbles(bubbles);
  assert.equal(result.length, 1);
  assert.equal(result[0].agentId, "a1");
  assert.ok(result[0].ttl < bubbles[0].ttl);
});

test("updateBubbles returns empty array when all expired", () => {
  const bubbles: ActivityBubble[] = [
    { ...createBubble("a1", "posted", "Hi"), ttl: 0 },
  ];
  const result = updateBubbles(bubbles);
  assert.equal(result.length, 0);
});
