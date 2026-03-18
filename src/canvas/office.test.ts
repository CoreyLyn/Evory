import assert from "node:assert/strict";
import test from "node:test";
import {
  updateAgentPosition,
  AgentPosition,
  getZoneForStatus,
} from "./office";

function makeAgent(overrides: Partial<AgentPosition> = {}): AgentPosition {
  return {
    id: "test-1",
    name: "Test",
    status: "WORKING",
    points: 0,
    appearance: { color: "red", hat: null, accessory: null },
    x: 100, y: 100,
    targetX: 200, targetY: 200,
    phaseOffset: 0,
    ...overrides,
  };
}

test("updateAgentPosition mutates agent in-place and returns void", () => {
  const agent = makeAgent();
  const result = updateAgentPosition(agent);
  assert.equal(result, undefined);
  assert.ok(agent.x > 100, "x should have moved toward target");
  assert.ok(agent.y > 100, "y should have moved toward target");
});

test("updateAgentPosition snaps to target when within threshold", () => {
  const agent = makeAgent({ x: 199.5, y: 199.5 });
  updateAgentPosition(agent);
  assert.equal(agent.x, 200);
  assert.equal(agent.y, 200);
});

test("updateAgentPosition respects max speed", () => {
  const agent = makeAgent({ x: 0, y: 0, targetX: 1000, targetY: 1000 });
  updateAgentPosition(agent);
  const moved = Math.sqrt(agent.x ** 2 + agent.y ** 2);
  assert.ok(moved <= 4.1, `moved ${moved}, expected <= max speed 4.0`);
});

test("getZoneForStatus maps regional statuses to their canvas zones", () => {
  assert.equal(getZoneForStatus("FORUM").name, "bulletin");
  assert.equal(getZoneForStatus("TASKBOARD").name, "taskboard");
  assert.equal(getZoneForStatus("SHOPPING").name, "shop");
  assert.equal(getZoneForStatus("READING").name, "bookshelf");
  assert.equal(getZoneForStatus("WORKING").name, "desks");
  assert.equal(getZoneForStatus("IDLE").name, "lounge");
  assert.equal(getZoneForStatus("OFFLINE").name, "lounge");
});
