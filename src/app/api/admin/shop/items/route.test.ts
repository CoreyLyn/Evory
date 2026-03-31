import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createShopItemFixture,
  createUserFixture,
  createUserSessionFixture,
} from "@/test/factories";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashSessionToken } from "@/lib/user-auth";
import { GET, POST } from "./route";
import { PUT } from "./[id]/route";
import { POST as activateItem } from "./[id]/activate/route";
import { POST as deactivateItem } from "./[id]/deactivate/route";

const prismaClient = prisma as Record<string, unknown>;

const originalMethods = {
  userSession: prismaClient.userSession,
  securityEvent: prismaClient.securityEvent,
  rateLimitCounter: prismaClient.rateLimitCounter,
  shopItem: prismaClient.shopItem,
};

const ADMIN_TOKEN = "admin-session-token";

function mockAdminSession() {
  prismaClient.userSession = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashSessionToken(ADMIN_TOKEN)
        ? createUserSessionFixture({
            tokenHash: where.tokenHash,
            user: createUserFixture({ role: "ADMIN", id: "admin-1" }),
          })
        : null,
    deleteMany: async () => ({ count: 0 }),
  };
}

function createMalformedJsonRouteRequest(
  url: string,
  options: {
    method: string;
    headers?: HeadersInit;
  }
) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  return new NextRequest(url, {
    method: options.method,
    headers,
    body: "{",
  });
}

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => ({ id: "se-1", type: "TEST" }),
  };
});

afterEach(() => {
  prismaClient.userSession = originalMethods.userSession;
  prismaClient.securityEvent = originalMethods.securityEvent;
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
  prismaClient.shopItem = originalMethods.shopItem;
});

test("GET /api/admin/shop/items returns items with purchase counts for admins", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    findMany: async () => [
      createShopItemFixture({
        id: "crown",
        isActive: false,
        _count: { inventory: 3 },
      }),
    ],
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/admin/shop/items", {
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data[0].purchaseCount, 3);
  assert.equal(json.data[0].isActive, false);
  assert.equal("_count" in json.data[0], false);
});

test("POST /api/admin/shop/items creates an item with trimmed validated input", async () => {
  mockAdminSession();
  let createdData: Record<string, unknown> | null = null;
  prismaClient.shopItem = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createdData = data;
      return createShopItemFixture(data);
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/items", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "  Crown  ",
        description: "  Royal  ",
        type: "hat",
        category: "hat",
        price: 250,
        spriteKey: " crown ",
        isActive: true,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(createdData, {
    name: "Crown",
    description: "Royal",
    type: "hat",
    category: "hat",
    price: 250,
    spriteKey: "crown",
    isActive: true,
  });
});

test("POST /api/admin/shop/items returns 400 for invalid payloads", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    create: async () => {
      throw new Error("should not be called");
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/items", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "",
        description: "",
        type: "hat",
        category: "hat",
        price: 250,
        spriteKey: "crown",
        isActive: true,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "name is required");
});

test("POST /api/admin/shop/items returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await POST(
    createMalformedJsonRouteRequest("http://localhost/api/admin/shop/items", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request body");
});

test("POST /api/admin/shop/items returns 500 for unexpected persistence errors", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    create: async () => {
      throw new Error("database offline");
    },
  };

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/items", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "Crown",
        description: "",
        type: "hat",
        category: "hat",
        price: 250,
        spriteKey: "crown",
        isActive: true,
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
});

test("PUT /api/admin/shop/items/[id] updates all editable fields", async () => {
  mockAdminSession();
  let updatedWhere: unknown = null;
  let updatedData: unknown = null;
  prismaClient.shopItem = {
    update: async ({ where, data }: { where: unknown; data: unknown }) => {
      updatedWhere = where;
      updatedData = data;
      return createShopItemFixture({
        id: "crown",
        ...(data as Record<string, unknown>),
      });
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/items/crown", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "  Party Crown  ",
        description: "  Brighter  ",
        type: "hat",
        category: "hat",
        price: 350,
        spriteKey: "party",
        isActive: false,
      },
    }),
    createRouteParams({ id: "crown" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.deepEqual(updatedWhere, { id: "crown" });
  assert.deepEqual(updatedData, {
    name: "Party Crown",
    description: "Brighter",
    type: "hat",
    category: "hat",
    price: 350,
    spriteKey: "party",
    isActive: false,
  });
});

test("PUT /api/admin/shop/items/[id] returns 400 for invalid payloads", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      throw new Error("should not be called");
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/items/crown", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "Crown",
        description: "",
        type: "hat",
        category: "hat",
        price: -1,
        spriteKey: "crown",
        isActive: true,
      },
    }),
    createRouteParams({ id: "crown" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "price must be a non-negative integer");
});

test("PUT /api/admin/shop/items/[id] returns 400 for malformed JSON", async () => {
  mockAdminSession();

  const response = await PUT(
    createMalformedJsonRouteRequest("http://localhost/api/admin/shop/items/crown", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "crown" })
  );
  const json = await response.json();

  assert.equal(response.status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid request body");
});

test("PUT /api/admin/shop/items/[id] returns 404 when the item does not exist", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      const error = new Error("missing");
      (error as Error & { code?: string }).code = "P2025";
      throw error;
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/items/missing", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "Crown",
        description: "",
        type: "hat",
        category: "hat",
        price: 100,
        spriteKey: "crown",
        isActive: true,
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Shop item not found");
});

test("PUT /api/admin/shop/items/[id] returns 500 for unexpected persistence errors", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      throw new Error("database offline");
    },
  };

  const response = await PUT(
    createRouteRequest("http://localhost/api/admin/shop/items/crown", {
      method: "PUT",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
      json: {
        name: "Crown",
        description: "",
        type: "hat",
        category: "hat",
        price: 100,
        spriteKey: "crown",
        isActive: true,
      },
    }),
    createRouteParams({ id: "crown" })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
});

test("POST /api/admin/shop/items/[id]/activate sets isActive to true", async () => {
  mockAdminSession();
  let updatedWhere: unknown = null;
  let updatedData: unknown = null;
  prismaClient.shopItem = {
    update: async ({ where, data }: { where: unknown; data: unknown }) => {
      updatedWhere = where;
      updatedData = data;
      return createShopItemFixture({ id: "crown", isActive: true });
    },
  };

  const response = await activateItem(
    createRouteRequest("http://localhost/api/admin/shop/items/crown/activate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "crown" })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(updatedWhere, { id: "crown" });
  assert.deepEqual(updatedData, { isActive: true });
});

test("POST /api/admin/shop/items/[id]/activate returns 404 when the item does not exist", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      const error = new Error("missing");
      (error as Error & { code?: string }).code = "P2025";
      throw error;
    },
  };

  const response = await activateItem(
    createRouteRequest("http://localhost/api/admin/shop/items/missing/activate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Shop item not found");
});

test("POST /api/admin/shop/items/[id]/activate returns 500 for unexpected persistence errors", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      throw new Error("database offline");
    },
  };

  const response = await activateItem(
    createRouteRequest("http://localhost/api/admin/shop/items/crown/activate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "crown" })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
});

test("POST /api/admin/shop/items/[id]/deactivate sets isActive to false", async () => {
  mockAdminSession();
  let updatedWhere: unknown = null;
  let updatedData: unknown = null;
  prismaClient.shopItem = {
    update: async ({ where, data }: { where: unknown; data: unknown }) => {
      updatedWhere = where;
      updatedData = data;
      return createShopItemFixture({ id: "crown", isActive: false });
    },
  };

  const response = await deactivateItem(
    createRouteRequest("http://localhost/api/admin/shop/items/crown/deactivate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "crown" })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(updatedWhere, { id: "crown" });
  assert.deepEqual(updatedData, { isActive: false });
});

test("POST /api/admin/shop/items/[id]/deactivate returns 404 when the item does not exist", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      const error = new Error("missing");
      (error as Error & { code?: string }).code = "P2025";
      throw error;
    },
  };

  const response = await deactivateItem(
    createRouteRequest("http://localhost/api/admin/shop/items/missing/deactivate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "missing" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Shop item not found");
});

test("POST /api/admin/shop/items/[id]/deactivate returns 500 for unexpected persistence errors", async () => {
  mockAdminSession();
  prismaClient.shopItem = {
    update: async () => {
      throw new Error("database offline");
    },
  };

  const response = await deactivateItem(
    createRouteRequest("http://localhost/api/admin/shop/items/crown/deactivate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "crown" })
  );
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.equal(json.success, false);
  assert.equal(json.error, "Internal server error");
});
