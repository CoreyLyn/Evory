# Admin Shop Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full admin shop management entrypoint that supports create, edit, list, activate, and deactivate operations while keeping already-purchased inactive items usable for Agents.

**Architecture:** Add `ShopItem.isActive` as the sale-state flag, centralize supported catalog metadata in a shared shop module, expose dedicated admin shop APIs under `/api/admin/shop/items`, and mount a new `shop` panel inside the existing `/admin` page. Public catalog reads and purchases become activation-aware, while equipment remains inventory-driven.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, Prisma, node:test, existing admin auth/rate-limit/request-security helpers, current i18n dictionaries.

---

### Task 1: Persist Shop Activation State And Catalog Metadata

**Files:**
- Create: `prisma/migrations/20260331_add_shop_item_activation/migration.sql`
- Create: `src/lib/shop-metadata.ts`
- Create: `src/lib/shop-metadata.test.ts`
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: `prisma/seed-shop.ts`
- Modify: `src/test/factories.ts`
- Test: `src/lib/shop-metadata.test.ts`

- [ ] **Step 1: Write the failing metadata test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  SHOP_ITEM_TYPE_OPTIONS,
  SHOP_ITEM_CATEGORY_OPTIONS,
  SHOP_ITEM_SPRITE_KEYS,
  isValidShopItemType,
  isValidShopItemCategory,
  isValidShopItemSpriteKey,
} from "./shop-metadata";

test("shop metadata exposes the supported type, category, and sprite-key options", () => {
  assert.deepEqual(SHOP_ITEM_TYPE_OPTIONS, ["color", "hat", "accessory"]);
  assert.deepEqual(SHOP_ITEM_CATEGORY_OPTIONS, ["skin", "hat", "accessory"]);
  assert.deepEqual(SHOP_ITEM_SPRITE_KEYS.color, ["red", "orange", "blue", "green", "purple", "pink", "gold", "cyan", "white"]);
  assert.deepEqual(SHOP_ITEM_SPRITE_KEYS.hat, ["crown", "tophat", "party", "chef"]);
  assert.deepEqual(SHOP_ITEM_SPRITE_KEYS.accessory, ["glasses", "monocle", "bowtie"]);
});

test("shop metadata validators accept supported values and reject unsupported ones", () => {
  assert.equal(isValidShopItemType("hat"), true);
  assert.equal(isValidShopItemType("cape"), false);
  assert.equal(isValidShopItemCategory("skin"), true);
  assert.equal(isValidShopItemCategory("mount"), false);
  assert.equal(isValidShopItemSpriteKey("color", "gold"), true);
  assert.equal(isValidShopItemSpriteKey("hat", "gold"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/shop-metadata.test.ts`

Expected: FAIL with a module resolution error because `src/lib/shop-metadata.ts` does not exist yet.

- [ ] **Step 3: Write the minimal metadata and persistence changes**

```ts
// src/lib/shop-metadata.ts
export const SHOP_ITEM_TYPE_OPTIONS = ["color", "hat", "accessory"] as const;
export type ShopItemTypeOption = (typeof SHOP_ITEM_TYPE_OPTIONS)[number];

export const SHOP_ITEM_CATEGORY_OPTIONS = ["skin", "hat", "accessory"] as const;
export type ShopItemCategoryOption = (typeof SHOP_ITEM_CATEGORY_OPTIONS)[number];

export const SHOP_ITEM_SPRITE_KEYS: Record<ShopItemTypeOption, readonly string[]> = {
  color: ["red", "orange", "blue", "green", "purple", "pink", "gold", "cyan", "white"],
  hat: ["crown", "tophat", "party", "chef"],
  accessory: ["glasses", "monocle", "bowtie"],
};

export function isValidShopItemType(value: unknown): value is ShopItemTypeOption {
  return typeof value === "string" && SHOP_ITEM_TYPE_OPTIONS.includes(value as ShopItemTypeOption);
}

export function isValidShopItemCategory(value: unknown): value is ShopItemCategoryOption {
  return typeof value === "string" && SHOP_ITEM_CATEGORY_OPTIONS.includes(value as ShopItemCategoryOption);
}

export function isValidShopItemSpriteKey(
  type: ShopItemTypeOption,
  spriteKey: unknown
): boolean {
  return typeof spriteKey === "string" && SHOP_ITEM_SPRITE_KEYS[type].includes(spriteKey);
}
```

```prisma
// prisma/schema.prisma
model ShopItem {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  type        String
  category    String
  price       Int
  spriteKey   String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  inventory AgentInventory[]
}
```

```sql
-- prisma/migrations/20260331_add_shop_item_activation/migration.sql
ALTER TABLE "ShopItem"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
```

```ts
// prisma/seed-shop.ts
{ id: "gold", name: "Golden Shell", description: "A shiny golden lobster shell", type: "color", category: "skin", price: 1000, spriteKey: "gold", isActive: true }
```

```ts
// src/test/factories.ts
export function createShopItemFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "crown",
    name: "Crown",
    description: "",
    price: 100,
    type: "hat",
    category: "hat",
    spriteKey: "crown",
    isActive: true,
    ...overrides,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test src/lib/shop-metadata.test.ts`

Expected: PASS with both metadata tests green.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260331_add_shop_item_activation/migration.sql prisma/seed.ts prisma/seed-shop.ts src/lib/shop-metadata.ts src/lib/shop-metadata.test.ts src/test/factories.ts
git commit -m "feat: add shop activation metadata"
```

### Task 2: Make Public Catalog And Purchase Flows Activation-Aware

**Files:**
- Create: `src/app/api/points/shop/route.test.ts`
- Modify: `src/app/api/points/shop/route.ts`
- Modify: `src/app/api/points/shop/purchase/route.ts`
- Modify: `src/app/api/points/shop/shop-workflow.test.ts`
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Test: `src/app/api/points/shop/route.test.ts`
- Test: `src/app/api/points/shop/shop-workflow.test.ts`

- [ ] **Step 1: Write the failing catalog and purchase tests**

```ts
// src/app/api/points/shop/route.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import prisma from "@/lib/prisma";
import { createShopItemFixture } from "@/test/factories";
import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;
const originalShopItem = prismaClient.shopItem;

test.afterEach(() => {
  prismaClient.shopItem = originalShopItem;
});

test("GET /api/points/shop returns only active items", async () => {
  prismaClient.shopItem = {
    findMany: async ({ where }: { where: { isActive: boolean } }) => {
      assert.deepEqual(where, { isActive: true });
      return [createShopItemFixture({ id: "crown", isActive: true })];
    },
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "crown");
});
```

```ts
// add to src/app/api/points/shop/shop-workflow.test.ts
test("purchase rejects inactive items", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    points: 120,
    avatarConfig: createAvatarConfigFixture(),
  });
  prismaClient.shopItem.findUnique = async () =>
    createShopItemFixture({
      id: "crown",
      isActive: false,
    });

  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: { itemId: "crown" },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.error, "Shop item not found");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/app/api/points/shop/route.test.ts src/app/api/points/shop/shop-workflow.test.ts`

Expected: FAIL because `GET /api/points/shop` does not pass `where: { isActive: true }`, and purchase does not reject inactive items yet.

- [ ] **Step 3: Write the minimal activation-aware route changes**

```ts
// src/app/api/points/shop/route.ts
const items = await prisma.shopItem.findMany({
  where: {
    isActive: true,
  },
  orderBy: [{ category: "asc" }, { name: "asc" }],
});
```

```ts
// src/app/api/points/shop/purchase/route.ts
const item = await prisma.shopItem.findUnique({
  where: { id: itemId },
});

if (!item || !item.isActive) {
  return notForAgentsResponse(Response.json(
    { success: false, error: "Shop item not found" },
    { status: 404 }
  ));
}
```

```ts
// src/app/api/agent/agent-read-api.test.ts
prismaClient.shopItem.findMany = async ({ where }: { where?: { isActive?: boolean } }) => {
  assert.deepEqual(where, { isActive: true });
  return [createShopItemFixture()];
};
```

Note: do not add an `isActive` check to `src/app/api/agents/me/equipment/route.ts`; existing owned-item lookup already preserves the approved behavior. Lock that in with regression coverage only.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/app/api/points/shop/route.test.ts src/app/api/points/shop/shop-workflow.test.ts src/app/api/agent/agent-read-api.test.ts`

Expected: PASS with active-only catalog reads and inactive purchase rejection covered.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/points/shop/route.ts src/app/api/points/shop/route.test.ts src/app/api/points/shop/purchase/route.ts src/app/api/points/shop/shop-workflow.test.ts src/app/api/agent/agent-read-api.test.ts
git commit -m "feat: gate public shop catalog by activation state"
```

### Task 3: Add Admin Shop CRUD APIs

**Files:**
- Create: `src/lib/admin-shop.ts`
- Create: `src/lib/admin-shop.test.ts`
- Create: `src/app/api/admin/shop/items/route.ts`
- Create: `src/app/api/admin/shop/items/route.test.ts`
- Create: `src/app/api/admin/shop/items/[id]/route.ts`
- Create: `src/app/api/admin/shop/items/[id]/route.test.ts`
- Create: `src/app/api/admin/shop/items/[id]/activate/route.ts`
- Create: `src/app/api/admin/shop/items/[id]/activate/route.test.ts`
- Create: `src/app/api/admin/shop/items/[id]/deactivate/route.ts`
- Create: `src/app/api/admin/shop/items/[id]/deactivate/route.test.ts`
- Test: `src/lib/admin-shop.test.ts`
- Test: `src/app/api/admin/shop/items/route.test.ts`
- Test: `src/app/api/admin/shop/items/[id]/route.test.ts`
- Test: `src/app/api/admin/shop/items/[id]/activate/route.test.ts`
- Test: `src/app/api/admin/shop/items/[id]/deactivate/route.test.ts`

- [ ] **Step 1: Write the failing validation and route tests**

```ts
// src/lib/admin-shop.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminShopItemInput } from "./admin-shop";

test("parseAdminShopItemInput trims strings and accepts valid values", () => {
  const parsed = parseAdminShopItemInput({
    name: "  Crown  ",
    description: "  Royal  ",
    type: "hat",
    category: "hat",
    price: 200,
    spriteKey: "crown",
    isActive: true,
  });

  assert.deepEqual(parsed, {
    name: "Crown",
    description: "Royal",
    type: "hat",
    category: "hat",
    price: 200,
    spriteKey: "crown",
    isActive: true,
  });
});

test("parseAdminShopItemInput rejects unsupported sprite keys", () => {
  assert.throws(
    () =>
      parseAdminShopItemInput({
        name: "Crown",
        description: "",
        type: "hat",
        category: "hat",
        price: 200,
        spriteKey: "gold",
        isActive: true,
      }),
    /spriteKey/
  );
});
```

```ts
// src/app/api/admin/shop/items/route.test.ts
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
  assert.equal(json.data[0].purchaseCount, 3);
  assert.equal(json.data[0].isActive, false);
});
```

```ts
// src/app/api/admin/shop/items/[id]/deactivate/route.test.ts
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

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/items/crown/deactivate", {
      method: "POST",
      headers: {
        cookie: `evory_user_session=${ADMIN_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    { params: Promise.resolve({ id: "crown" }) }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(updatedWhere, { id: "crown" });
  assert.deepEqual(updatedData, { isActive: false });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/lib/admin-shop.test.ts src/app/api/admin/shop/items/route.test.ts src/app/api/admin/shop/items/[id]/deactivate/route.test.ts`

Expected: FAIL because the validation helper and admin shop routes do not exist yet.

- [ ] **Step 3: Write the minimal helper and route implementations**

```ts
// src/lib/admin-shop.ts
import {
  isValidShopItemCategory,
  isValidShopItemSpriteKey,
  isValidShopItemType,
  type ShopItemCategoryOption,
  type ShopItemTypeOption,
} from "@/lib/shop-metadata";

export type AdminShopItemInput = {
  name: string;
  description: string;
  type: ShopItemTypeOption;
  category: ShopItemCategoryOption;
  price: number;
  spriteKey: string;
  isActive: boolean;
};

export function parseAdminShopItemInput(body: unknown): AdminShopItemInput {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const spriteKey = typeof input.spriteKey === "string" ? input.spriteKey.trim() : "";
  const { type, category, price, isActive } = input;

  if (!name) throw new Error("name is required");
  if (!isValidShopItemType(type)) throw new Error("type is invalid");
  if (!isValidShopItemCategory(category)) throw new Error("category is invalid");
  if (!Number.isInteger(price) || (price as number) < 0) throw new Error("price must be a non-negative integer");
  if (!isValidShopItemSpriteKey(type, spriteKey)) throw new Error("spriteKey is invalid");
  if (typeof isActive !== "boolean") throw new Error("isActive is required");

  return {
    name,
    description,
    type,
    category,
    price: price as number,
    spriteKey,
    isActive,
  };
}
```

```ts
// src/app/api/admin/shop/items/route.ts
export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const items = await prisma.shopItem.findMany({
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          inventory: true,
        },
      },
    },
  });

  return notForAgentsResponse(Response.json({
    success: true,
    data: items.map((item) => ({
      ...item,
      purchaseCount: item._count.inventory,
    })),
  }));
}

export async function POST(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-items",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-shop-items",
    routeKey: "admin-shop-items",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  try {
    const data = parseAdminShopItemInput(await request.json());
    const item = await prisma.shopItem.create({ data });
    return notForAgentsResponse(Response.json({ success: true, data: item }));
  } catch (error) {
    return notForAgentsResponse(Response.json(
      { success: false, error: error instanceof Error ? error.message : "Invalid shop item" },
      { status: 400 }
    ));
  }
}
```

```ts
// src/app/api/admin/shop/items/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-item-update",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const { id } = await params;

  try {
    const data = parseAdminShopItemInput(await request.json());
    const item = await prisma.shopItem.update({
      where: { id },
      data,
    });

    return notForAgentsResponse(Response.json({ success: true, data: item }));
  } catch (error) {
    return notForAgentsResponse(Response.json(
      { success: false, error: error instanceof Error ? error.message : "Invalid shop item" },
      { status: 400 }
    ));
  }
}
```

```ts
// src/app/api/admin/shop/items/[id]/activate/route.ts
return notForAgentsResponse(Response.json({
  success: true,
  data: await prisma.shopItem.update({
    where: { id },
    data: { isActive: true },
  }),
}));
```

```ts
// src/app/api/admin/shop/items/[id]/deactivate/route.ts
return notForAgentsResponse(Response.json({
  success: true,
  data: await prisma.shopItem.update({
    where: { id },
    data: { isActive: false },
  }),
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/lib/admin-shop.test.ts src/app/api/admin/shop/items/route.test.ts src/app/api/admin/shop/items/[id]/route.test.ts src/app/api/admin/shop/items/[id]/activate/route.test.ts src/app/api/admin/shop/items/[id]/deactivate/route.test.ts`

Expected: PASS with validation, list/create, update, and state-toggle coverage green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-shop.ts src/lib/admin-shop.test.ts src/app/api/admin/shop/items/route.ts src/app/api/admin/shop/items/route.test.ts src/app/api/admin/shop/items/[id]/route.ts src/app/api/admin/shop/items/[id]/route.test.ts src/app/api/admin/shop/items/[id]/activate/route.ts src/app/api/admin/shop/items/[id]/activate/route.test.ts src/app/api/admin/shop/items/[id]/deactivate/route.ts src/app/api/admin/shop/items/[id]/deactivate/route.test.ts
git commit -m "feat: add admin shop management api"
```

### Task 4: Add The Admin Shop Tab And Management Panel

**Files:**
- Create: `src/app/admin/admin-shop-panel.tsx`
- Create: `src/app/admin/admin-shop-panel.test.tsx`
- Modify: `src/app/admin/admin-tabs.tsx`
- Modify: `src/app/admin/admin-tabs.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`
- Test: `src/app/admin/admin-tabs.test.tsx`
- Test: `src/app/admin/admin-shop-panel.test.tsx`

- [ ] **Step 1: Write the failing tab and panel rendering tests**

```ts
// src/app/admin/admin-tabs.test.tsx
test("normalizeAdminPrimaryTab recognizes shop", () => {
  assert.equal(normalizeAdminPrimaryTab("shop"), "shop");
});

test("AdminPrimaryTabs renders the shop tab", () => {
  const html = renderToStaticMarkup(
    <AdminPrimaryTabs
      activeTab="shop"
      labels={{
        forum: "内容审核",
        shop: "商店管理",
        site: "站点访问控制",
        knowledge: "知识库管理",
      }}
      onChange={() => undefined}
    />
  );

  assert.match(html, /商店管理/);
});
```

```ts
// src/app/admin/admin-shop-panel.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminShopPanel } from "./admin-shop-panel";

test("AdminShopPanel renders create form and inactive badge", () => {
  const html = renderToStaticMarkup(
    <AdminShopPanel
      t={(key) => key}
      items={[
        {
          id: "crown",
          name: "Crown",
          description: "Royal",
          type: "hat",
          category: "hat",
          price: 200,
          spriteKey: "crown",
          isActive: false,
          purchaseCount: 3,
        },
      ]}
      loading={false}
      busyItemId={null}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.shop\.createTitle/);
  assert.match(html, /admin\.shop\.status\.inactive/);
  assert.match(html, /3/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/app/admin/admin-tabs.test.tsx src/app/admin/admin-shop-panel.test.tsx`

Expected: FAIL because `shop` is not a recognized admin tab and the panel component does not exist yet.

- [ ] **Step 3: Write the minimal tab, panel, and page wiring**

```ts
// src/app/admin/admin-tabs.tsx
export type AdminPrimaryTab = "forum" | "shop" | "site" | "knowledge";

const ADMIN_PRIMARY_TABS: AdminPrimaryTab[] = ["forum", "shop", "site", "knowledge"];

export function normalizeAdminPrimaryTab(
  value: string | null | undefined
): AdminPrimaryTab {
  if (value === "shop" || value === "site" || value === "knowledge") {
    return value;
  }

  return "forum";
}
```

```tsx
// src/app/admin/admin-shop-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SHOP_ITEM_CATEGORY_OPTIONS,
  SHOP_ITEM_SPRITE_KEYS,
  SHOP_ITEM_TYPE_OPTIONS,
  type ShopItemTypeOption,
} from "@/lib/shop-metadata";

type AdminShopItem = {
  id: string;
  name: string;
  description: string;
  type: ShopItemTypeOption;
  category: string;
  price: number;
  spriteKey: string;
  isActive: boolean;
  purchaseCount: number;
};

export function AdminShopPanel({ t, onError, onSuccess }: {
  t: (key: string) => string;
  items: AdminShopItem[];
  loading: boolean;
  busyItemId: string | null;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    type: "color" as ShopItemTypeOption,
    category: "skin",
    price: 0,
    spriteKey: "red",
    isActive: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!SHOP_ITEM_SPRITE_KEYS[draft.type].includes(draft.spriteKey)) {
      setDraft((current) => ({
        ...current,
        spriteKey: SHOP_ITEM_SPRITE_KEYS[current.type][0],
      }));
    }
  }, [draft.type, draft.spriteKey]);

  return <Card>{t("admin.shop.createTitle")}</Card>;
}
```

```tsx
// src/app/admin/page.tsx
import { AdminShopPanel } from "./admin-shop-panel";

const [shopItems, setShopItems] = useState([]);
const [shopLoading, setShopLoading] = useState(false);

useEffect(() => {
  if (!authed || activePrimaryTab !== "shop") return;

  let cancelled = false;
  async function loadShopItems() {
    setShopLoading(true);
    try {
      const response = await fetch("/api/admin/shop/items");
      const json = await response.json();
      if (!cancelled && json.success) {
        setShopItems(json.data);
      }
    } catch {
      if (!cancelled) setError(t("admin.actionFailed"));
    }
    if (!cancelled) setShopLoading(false);
  }

  void loadShopItems();
  return () => {
    cancelled = true;
  };
}, [activePrimaryTab, authed, refreshKey, t]);

<AdminPrimaryTabs
  activeTab={activePrimaryTab}
  labels={{
    forum: t("admin.title"),
    shop: t("admin.shop.title"),
    site: t("admin.siteControls.title"),
    knowledge: t("admin.knowledge.title"),
  }}
  onChange={handlePrimaryTabChange}
/>

{activePrimaryTab === "shop" && (
  <AdminShopPanel
    t={t}
    items={shopItems}
    loading={shopLoading}
    busyItemId={busyId}
    onRefresh={async () => setRefreshKey((k) => k + 1)}
    onError={setError}
    onSuccess={setSuccess}
  />
)}
```

```ts
// src/i18n/en.ts
"admin.shop.title": "Shop Management",
"admin.shop.createTitle": "Create Shop Item",
"admin.shop.status.active": "Active",
"admin.shop.status.inactive": "Inactive",
"admin.shop.purchaseCount": "Purchases",
"admin.shop.action.activate": "Activate",
"admin.shop.action.deactivate": "Deactivate",
"admin.shop.form.name": "Name",
"admin.shop.form.description": "Description",
"admin.shop.form.type": "Type",
"admin.shop.form.category": "Category",
"admin.shop.form.price": "Price",
"admin.shop.form.spriteKey": "Sprite Key",
"admin.shop.form.isActive": "List item immediately",
"admin.shop.form.submitCreate": "Create Item",
"admin.shop.form.submitUpdate": "Save Changes",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/app/admin/admin-tabs.test.tsx src/app/admin/admin-shop-panel.test.tsx`

Expected: PASS with the new tab label and shop panel rendering covered.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/admin-tabs.tsx src/app/admin/admin-tabs.test.tsx src/app/admin/admin-shop-panel.tsx src/app/admin/admin-shop-panel.test.tsx src/app/admin/page.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat: add admin shop management panel"
```

### Task 5: Full Regression Verification

**Files:**
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/i18n/translations.test.ts`
- Test: `src/app/api/points/shop/route.test.ts`
- Test: `src/app/api/points/shop/shop-workflow.test.ts`
- Test: `src/app/api/admin/shop/items/route.test.ts`
- Test: `src/app/api/admin/shop/items/[id]/route.test.ts`
- Test: `src/app/api/admin/shop/items/[id]/activate/route.test.ts`
- Test: `src/app/api/admin/shop/items/[id]/deactivate/route.test.ts`
- Test: `src/app/admin/admin-tabs.test.tsx`
- Test: `src/app/admin/admin-shop-panel.test.tsx`
- Test: `src/i18n/translations.test.ts`

- [ ] **Step 1: Add any missing failing regression assertions**

```ts
// src/app/api/agent/agent-write-api.test.ts
assert.equal(json.data.inventory.itemId, "crown");
assert.equal(json.data.avatarConfig.hat, "crown");
```

```ts
// src/i18n/translations.test.ts
assert.equal(
  Object.prototype.hasOwnProperty.call(en, "admin.shop.title"),
  true
);
assert.equal(
  Object.prototype.hasOwnProperty.call(zh, "admin.shop.title"),
  true
);
```

- [ ] **Step 2: Run the focused regression suite and verify any missing assertions fail first**

Run: `node --import tsx --test src/app/api/agent/agent-write-api.test.ts src/i18n/translations.test.ts`

Expected: FAIL only if the new translation keys or inactive-item expectations are still missing.

- [ ] **Step 3: Fill the remaining gaps and keep the suite green**

```ts
// src/i18n/zh.ts
"admin.shop.title": "商店管理",
"admin.shop.createTitle": "新增商品",
"admin.shop.status.active": "上架中",
"admin.shop.status.inactive": "已下架",
"admin.shop.purchaseCount": "购买次数",
"admin.shop.action.activate": "上架",
"admin.shop.action.deactivate": "下架",
```

```ts
// Keep createShopItemFixture consumers explicit about activation state when needed
createShopItemFixture({ id: "crown", isActive: true });
```

- [ ] **Step 4: Run the full verification suite**

Run: `node --import tsx --test src/app/api/points/shop/route.test.ts src/app/api/points/shop/shop-workflow.test.ts src/app/api/admin/shop/items/route.test.ts src/app/api/admin/shop/items/[id]/route.test.ts src/app/api/admin/shop/items/[id]/activate/route.test.ts src/app/api/admin/shop/items/[id]/deactivate/route.test.ts src/app/admin/admin-tabs.test.tsx src/app/admin/admin-shop-panel.test.tsx src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts src/i18n/translations.test.ts`

Run: `npm test`

Expected: PASS for the focused suite first, then PASS for the full repository test suite.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts src/i18n/translations.test.ts
git commit -m "test: cover admin shop management regressions"
```
