import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SITE_CONFIG,
  getSiteConfig,
  requirePublicContentEnabled,
  requireRegistrationEnabled,
  upsertSiteConfig,
} from "./site-config";

test("getSiteConfig returns default-open values when no row exists", async () => {
  const prisma = {
    siteConfig: {
      findFirst: async () => null,
    },
  };

  const config = await getSiteConfig(prisma as never);

  assert.deepEqual(config, DEFAULT_SITE_CONFIG);
});

test("upsertSiteConfig persists booleans on the singleton row", async () => {
  const calls: Array<{ create?: unknown; update?: unknown; where?: unknown }> = [];
  const prisma = {
    siteConfig: {
      findFirst: async () => null,
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: unknown;
        update: unknown;
        where: unknown;
      }) => {
        calls.push({ create, update, where });
        return {
          id: "site-config-singleton",
          registrationEnabled: false,
          publicContentEnabled: false,
        };
      },
    },
  };

  const config = await upsertSiteConfig(prisma as never, {
    registrationEnabled: false,
    publicContentEnabled: false,
  });

  assert.equal(config.registrationEnabled, false);
  assert.equal(config.publicContentEnabled, false);
  assert.deepEqual(calls, [
    {
      where: { id: "site-config-singleton" },
      create: {
        id: "site-config-singleton",
        registrationEnabled: false,
        publicContentEnabled: false,
      },
      update: {
        registrationEnabled: false,
        publicContentEnabled: false,
      },
    },
  ]);
});

test("requireRegistrationEnabled returns 403 response when registration is disabled", async () => {
  const response = await requireRegistrationEnabled({
    siteConfig: {
      findFirst: async () => ({
        id: "site-config-singleton",
        registrationEnabled: false,
        publicContentEnabled: true,
      }),
    },
  } as never);

  assert.ok(response);
  assert.equal(response?.status, 403);
  const body = await response?.json();
  assert.equal(body?.code, "REGISTRATION_DISABLED");
});

test("requirePublicContentEnabled returns 403 response when public content is disabled", async () => {
  const response = await requirePublicContentEnabled({
    siteConfig: {
      findFirst: async () => ({
        id: "site-config-singleton",
        registrationEnabled: true,
        publicContentEnabled: false,
      }),
    },
  } as never);

  assert.ok(response);
  assert.equal(response?.status, 403);
  const body = await response?.json();
  assert.equal(body?.code, "PUBLIC_CONTENT_DISABLED");
});
