import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptSecretValue,
  encryptSecretValue,
  maskSecretValue,
} from "./secret-crypto";

const TEST_KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

function withKey(key: string, fn: () => void) {
  const previous = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = key;
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
    } else {
      process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previous;
    }
  }
}

test("maskSecretValue matches the plan example", () => {
  assert.equal(maskSecretValue("sk-live-abcdef1234"), "sk-****1234");
});

test("encryptSecretValue and decryptSecretValue roundtrip the plan example", () => {
  withKey(TEST_KEY, () => {
    const value = "sk-live-abcdef1234";
    const payload = encryptSecretValue(value);
    assert.notEqual(payload, value);
    assert.equal(decryptSecretValue(payload), value);
  });
});

test("decryptSecretValue rejects payloads encrypted with another key", () => {
  let payload = "";
  withKey(TEST_KEY, () => {
    payload = encryptSecretValue("secret");
  });

  assert.throws(() => {
    withKey(OTHER_KEY, () => {
      decryptSecretValue(payload);
    });
  });
});

test("decryptSecretValue rejects malformed payloads with a stable error", () => {
  withKey(TEST_KEY, () => {
    assert.throws(() => decryptSecretValue("nope"), /Invalid secret payload/);
    assert.throws(
      () => decryptSecretValue("a.b.c.d"),
      /Invalid secret payload/
    );
    assert.throws(
      () =>
        decryptSecretValue(
          [
            Buffer.alloc(12, 1).toString("base64"),
            Buffer.alloc(8, 2).toString("base64"),
            Buffer.alloc(1, 3).toString("base64"),
          ].join(".")
        ),
      /Invalid secret payload/
    );
  });
});

test("decryptSecretValue fails when encryption key is missing", () => {
  const previous = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  delete process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  try {
    const payload = [
      Buffer.alloc(12, 1).toString("base64"),
      Buffer.alloc(16, 2).toString("base64"),
      Buffer.alloc(1, 3).toString("base64"),
    ].join(".");
    assert.throws(
      () => decryptSecretValue(payload),
      /SECRET_INVENTORY_ENCRYPTION_KEY/
    );
  } finally {
    if (previous !== undefined) {
      process.env.SECRET_INVENTORY_ENCRYPTION_KEY = previous;
    }
  }
});

test("encryptSecretValue returns payload with three segments", () => {
  withKey(TEST_KEY, () => {
    const payload = encryptSecretValue("secret");
    assert.equal(payload.split(".").length, 3);
  });
});
