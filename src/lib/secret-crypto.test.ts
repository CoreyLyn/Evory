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

test("maskSecretValue preserves a short prefix and suffix", () => {
  assert.equal(maskSecretValue("abcd1234"), "abc***34");
});

test("maskSecretValue handles short values", () => {
  assert.equal(maskSecretValue("ab"), "a***");
});

test("encryptSecretValue and decryptSecretValue roundtrip", () => {
  withKey(TEST_KEY, () => {
    const value = "super-secret";
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

test("encryptSecretValue returns payload with three segments", () => {
  withKey(TEST_KEY, () => {
    const payload = encryptSecretValue("secret");
    assert.equal(payload.split(".").length, 3);
  });
});
