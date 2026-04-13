import assert from "node:assert/strict";
import test from "node:test";

import {
  isAdminProvidedApiKeyValidationError,
  parseAdminProvidedApiKeyInput,
  parseAdminProvidedApiKeyUpdateInput,
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

test("parseAdminProvidedApiKeyInput allows missing providerLabel", () => {
  const parsed = parseAdminProvidedApiKeyInput({
    label: "Primary OpenAI key",
    apiKey: "sk-live-123456789",
  });

  assert.equal(parsed.providerLabel, null);
});

test("isAdminProvidedApiKeyValidationError narrows parser errors", () => {
  try {
    parseAdminProvidedApiKeyInput(null);
    assert.fail("Expected parser to throw");
  } catch (error) {
    assert.equal(isAdminProvidedApiKeyValidationError(error), true);
  }
});

test("parseAdminProvidedApiKeyUpdateInput rejects apiKey updates", () => {
  assert.throws(
    () =>
      parseAdminProvidedApiKeyUpdateInput({
        label: "Backup OpenAI key",
        providerLabel: "OpenAI",
        isActive: true,
        apiKey: "sk-live-123456789",
      }),
    /apiKey updates are not supported/
  );
});

test("parseAdminProvidedApiKeyUpdateInput requires boolean isActive", () => {
  assert.throws(
    () =>
      parseAdminProvidedApiKeyUpdateInput({
        label: "Backup OpenAI key",
        providerLabel: "OpenAI",
        isActive: "true",
      }),
    /isActive is required/
  );
});

test("parseAdminProvidedApiKeyUpdateInput maps blank providerLabel to null when supplied", () => {
  const parsed = parseAdminProvidedApiKeyUpdateInput({
    label: "Backup OpenAI key",
    providerLabel: "",
    isActive: true,
  });

  assert.deepEqual(parsed, {
    label: "Backup OpenAI key",
    providerLabel: null,
    isActive: true,
  });
});
