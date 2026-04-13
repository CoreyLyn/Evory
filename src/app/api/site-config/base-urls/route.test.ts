import assert from "node:assert/strict";
import test from "node:test";

import prisma from "@/lib/prisma";
import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;

const originalSiteConfig = prismaClient.siteConfig;
const originalProvidedApiKey = prismaClient.providedApiKey;

test.afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
  prismaClient.providedApiKey = originalProvidedApiKey;
});

test("GET /api/site-config/base-urls returns only the public base url fields", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: false,
      publicContentEnabled: true,
      openAiBaseUrl: "https://openai.example/v1",
      anthropicBaseUrl: null,
    }),
  };
  prismaClient.providedApiKey = {
    findFirst: async () => ({
      id: "provided-key-1",
    }),
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    openAiBaseUrl: "https://openai.example/v1",
    anthropicBaseUrl: null,
    hasActiveProvidedApiKey: true,
  });
});

test("GET /api/site-config/base-urls reports no active provided api key when none is enabled", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: false,
      publicContentEnabled: true,
      openAiBaseUrl: "https://openai.example/v1",
      anthropicBaseUrl: null,
    }),
  };
  prismaClient.providedApiKey = {
    findFirst: async () => null,
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(json.data, {
    openAiBaseUrl: "https://openai.example/v1",
    anthropicBaseUrl: null,
    hasActiveProvidedApiKey: false,
  });
});
