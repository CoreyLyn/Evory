import assert from "node:assert/strict";
import test from "node:test";

import {
  isAdminProvidedApiKeyValidationError,
  parseAdminProvidedApiKeyInput,
} from "./admin-provided-api-keys";

test("parseAdminProvidedApiKeyInput accepts valid payload", () => {
  const parsed = parseAdminProvidedApiKeyInput({
    label: "  Primary OpenAI key  ",
    providerLabel: "  OpenAI  ",
    apiKey: "  sk-live-123456789  ",
    isActive: true,
  });

  assert.equal(parsed.label, "Primary OpenAI key");
  assert.equal(parsed.providerLabel, "OpenAI");
  assert.equal(parsed.apiKey, "sk-live-123456789");
  assert.equal(parsed.isActive, true);
});

test("parseAdminProvidedApiKeyInput defaults isActive to true", () => {
  const parsed = parseAdminProvidedApiKeyInput({
    label: "Primary OpenAI key",
    providerLabel: "OpenAI",
    apiKey: "sk-live-123456789",
  });

  assert.equal(parsed.isActive, true);
});

test("isAdminProvidedApiKeyValidationError narrows parser errors", () => {
  try {
    parseAdminProvidedApiKeyInput(null);
    assert.fail("Expected parser to throw");
  } catch (error) {
    assert.equal(isAdminProvidedApiKeyValidationError(error), true);
  }
});
