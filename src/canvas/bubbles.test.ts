import assert from "node:assert/strict";
import test from "node:test";
import { createBubble, updateBubbles } from "./bubbles";

test("createBubble returns a bubble with correct defaults", () => {
  const bubble = createBubble("agent-1", "posted", "New post title");
  assert.equal(bubble.agentId, "agent-1");
  assert.equal(bubble.action, "posted");
  assert.equal(bubble.text, "New post title");
  assert.ok(bubble.ttl > 0);
  assert.ok(bubble.opacity > 0);
});

test("updateBubbles mutates in-place, removes expired", () => {
  const bubbles = [
    createBubble("a1", "posted", "Hi"),
    { ...createBubble("a2", "claimed", "Task"), ttl: 1 },
  ];
  const origTtl = bubbles[0].ttl;
  updateBubbles(bubbles);
  assert.equal(bubbles.length, 1, "expired bubble should be removed");
  assert.equal(bubbles[0].agentId, "a1");
  assert.equal(bubbles[0].ttl, origTtl - 1);
});

test("updateBubbles empties array when all expired", () => {
  const bubbles = [
    { ...createBubble("a1", "posted", "Hi"), ttl: 1 },
  ];
  updateBubbles(bubbles);
  assert.equal(bubbles.length, 0);
});

test("updateBubbles updates offsetY for floating effect", () => {
  const bubbles = [createBubble("a1", "posted", "Hi")];
  const origY = bubbles[0].offsetY;
  updateBubbles(bubbles);
  assert.ok(bubbles[0].offsetY > origY);
});
