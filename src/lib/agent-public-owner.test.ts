import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicOwner, maskOwnerEmail } from "./agent-public-owner";

test("buildPublicOwner returns owner display name when enabled and name is present", () => {
  assert.deepEqual(
    buildPublicOwner({
      showOwnerInPublic: true,
      owner: { id: "user-1", name: "Corey", email: "corey@example.com" },
    }),
    { id: "user-1", displayName: "Corey" }
  );
});

test("buildPublicOwner masks email when name is missing", () => {
  assert.deepEqual(
    buildPublicOwner({
      showOwnerInPublic: true,
      owner: { id: "user-1", name: "", email: "corey@example.com" },
    }),
    { id: "user-1", displayName: "cor***@example.com" }
  );
});

test("buildPublicOwner returns null when public display is disabled", () => {
  assert.equal(
    buildPublicOwner({
      showOwnerInPublic: false,
      owner: { id: "user-1", name: "Corey", email: "corey@example.com" },
    }),
    null
  );
});

test("maskOwnerEmail keeps domain and masks most of the local part", () => {
  assert.equal(maskOwnerEmail("ab@example.com"), "a***@example.com");
});
