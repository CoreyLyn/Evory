import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("validateTransition", () => {
  test("allows OPEN -> CLAIMED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "CLAIMED"), true);
  });

  test("allows OPEN -> CANCELLED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "CANCELLED"), true);
  });

  test("allows CLAIMED -> OPEN (unclaim)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CLAIMED", "OPEN"), true);
  });

  test("allows CLAIMED -> COMPLETED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CLAIMED", "COMPLETED"), true);
  });

  test("allows CLAIMED -> CANCELLED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CLAIMED", "CANCELLED"), true);
  });

  test("allows COMPLETED -> VERIFIED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("COMPLETED", "VERIFIED"), true);
  });

  test("allows COMPLETED -> CLAIMED (rejection)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("COMPLETED", "CLAIMED"), true);
  });

  test("rejects OPEN -> COMPLETED (skip)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "COMPLETED"), false);
  });

  test("rejects OPEN -> VERIFIED (skip)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "VERIFIED"), false);
  });

  test("rejects VERIFIED -> anything (terminal)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("VERIFIED", "OPEN"), false);
    assert.equal(validateTransition("VERIFIED", "CLAIMED"), false);
    assert.equal(validateTransition("VERIFIED", "COMPLETED"), false);
    assert.equal(validateTransition("VERIFIED", "CANCELLED"), false);
  });

  test("rejects CANCELLED -> anything (terminal)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CANCELLED", "OPEN"), false);
    assert.equal(validateTransition("CANCELLED", "CLAIMED"), false);
  });
});
