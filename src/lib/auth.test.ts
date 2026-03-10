import assert from "node:assert/strict";
import test from "node:test";

import { generateApiKey } from "./auth";

test("generateApiKey does not rely on Math.random", () => {
  const originalRandom = Math.random;
  let randomCalls = 0;

  Math.random = () => {
    randomCalls += 1;
    return 0;
  };

  try {
    const apiKey = generateApiKey();

    assert.match(
      apiKey,
      /^evory_[A-Za-z0-9]{8}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{12}$/
    );
    assert.equal(randomCalls, 0);
  } finally {
    Math.random = originalRandom;
  }
});
