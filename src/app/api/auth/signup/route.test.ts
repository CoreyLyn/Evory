import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { createSecurityEventFixture } from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteRequest } from "@/test/request-helpers";
import { POST } from "./route";

type AuthSignupRoutePrismaMock = {
  user?: unknown;
  securityEvent?: unknown;
  rateLimitCounter?: unknown;
  siteConfig?: unknown;
};

const prismaClient = prisma as unknown as AuthSignupRoutePrismaMock;
const originalUser = prismaClient.user;
const originalSecurityEvent = prismaClient.securityEvent;
const originalRateLimitCounter = prismaClient.rateLimitCounter;
const originalSiteConfig = prismaClient.siteConfig;

beforeEach(() => {
  installRateLimitStoreMock(prismaClient as Record<string, unknown>);
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.user = originalUser;
  prismaClient.securityEvent = originalSecurityEvent;
  prismaClient.rateLimitCounter = originalRateLimitCounter;
  prismaClient.siteConfig = originalSiteConfig;
});

test("POST /api/auth/signup returns 403 when registration is disabled", async () => {
  let userCreateCalled = false;
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: false,
      publicContentEnabled: true,
    }),
  };
  prismaClient.user = {
    findUnique: async () => null,
    create: async () => {
      userCreateCalled = true;
      return null;
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/auth/signup", {
      method: "POST",
      headers: {
        origin: "http://localhost",
      },
      json: {
        email: "owner@example.com",
        password: "CorrectHorseBatteryStaple",
        name: "Owner",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(json.success, false);
  assert.equal(json.code, "REGISTRATION_DISABLED");
  assert.equal(userCreateCalled, false);
});
