# Shop Secret Credential Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-imported secret credential products that Agents can buy for points and receive directly in the purchase response, without breaking the current cosmetic shop flow.

**Architecture:** Keep the current `ShopItem -> AgentInventory -> equipment` path for cosmetics in phase one. Add a parallel generalized product stack for `SECRET_CREDENTIAL` products with dedicated inventory, encryption, order, and delivery records, then branch the existing purchase entrypoint by request shape and product type.

**Tech Stack:** Next.js route handlers, Prisma, PostgreSQL, Node test runner, existing admin auth and rate-limit helpers

---

## File Structure

### New files

- `prisma/migrations/20260402_add_secret_shop_products/migration.sql`
- `src/lib/secret-crypto.ts`
- `src/lib/secret-crypto.test.ts`
- `src/lib/admin-secret-products.ts`
- `src/lib/admin-secret-products.test.ts`
- `src/lib/secret-product-fulfillment.ts`
- `src/lib/secret-product-fulfillment.test.ts`
- `src/app/api/admin/shop/products/route.ts`
- `src/app/api/admin/shop/products/route.test.ts`
- `src/app/api/admin/shop/products/[id]/route.ts`
- `src/app/api/admin/shop/products/[id]/route.test.ts`
- `src/app/api/admin/shop/products/[id]/inventory/route.ts`
- `src/app/api/admin/shop/products/[id]/inventory/route.test.ts`
- `src/app/api/admin/shop/inventory/[inventoryId]/void/route.ts`
- `src/app/api/admin/shop/inventory/[inventoryId]/void/route.test.ts`
- `src/app/admin/admin-secret-products-panel.tsx`
- `src/app/admin/admin-secret-products-panel.test.tsx`

### Modified files

- `prisma/schema.prisma`
- `src/test/factories.ts`
- `src/app/api/points/shop/purchase/route.ts`
- `src/app/api/points/shop/shop-workflow.test.ts`
- `src/app/api/agent/shop/route.ts`
- `src/app/api/agent/agent-read-api.test.ts`
- `src/app/api/agent/agent-write-api.test.ts`
- `src/lib/shop-client.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/admin-tabs.tsx`
- `src/app/admin/admin-tabs.test.tsx`
- `src/i18n/en.ts`
- `src/i18n/zh.ts`
- `src/i18n/translations.test.ts`

### Responsibility boundaries

- `secret-crypto.ts` owns masking, encrypting, and decrypting secret values.
- `admin-secret-products.ts` owns admin payload validation for generalized products and secret inventory imports.
- `secret-product-fulfillment.ts` owns transactional purchase logic for `SECRET_CREDENTIAL`.
- admin product routes own CRUD plus inventory import and void actions for the new secret-product system.
- `purchase/route.ts` remains the unified buy entrypoint, but delegates to either cosmetic or secret fulfillment based on request shape.
- the admin UI gains a dedicated panel for secret products instead of overloading the existing cosmetic form.

---

### Task 1: Add the schema and test fixtures for secret products

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260402_add_secret_shop_products/migration.sql`
- Modify: `src/test/factories.ts`

- [ ] **Step 1: Write the failing schema-level regression test fixture usage**

Add fixture coverage for the new records in [`src/test/factories.ts`](/Volumes/T7/Code/Evory/src/test/factories.ts) so route and domain tests can construct generalized products and secret inventory rows without ad hoc literals:

```ts
export function createCatalogProductFixture(
  overrides: Partial<{
    id: string;
    name: string;
    description: string;
    productType: "COSMETIC" | "SECRET_CREDENTIAL";
    price: number;
    currencyType: "POINTS";
    isActive: boolean;
    displayConfig: Record<string, unknown>;
    fulfillmentConfig: Record<string, unknown>;
  }> = {}
) {
  return {
    id: "product-1",
    name: "Provider Key Pack",
    description: "One pre-imported API key",
    productType: "SECRET_CREDENTIAL" as const,
    price: 300,
    currencyType: "POINTS" as const,
    isActive: true,
    displayConfig: {},
    fulfillmentConfig: {},
    createdAt: new Date("2026-04-02T00:00:00.000Z"),
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    ...overrides,
  };
}

export function createSecretInventoryFixture(
  overrides: Partial<{
    id: string;
    productId: string;
    maskedValue: string;
    encryptedValue: string;
    status: "AVAILABLE" | "RESERVED" | "SOLD" | "VOID";
  }> = {}
) {
  return {
    id: "secret-1",
    productId: "product-1",
    maskedValue: "sk-****1234",
    encryptedValue: "enc:fixture",
    status: "AVAILABLE" as const,
    importBatchId: "batch-1",
    soldOrderId: null,
    createdAt: new Date("2026-04-02T00:00:00.000Z"),
    soldAt: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run type-aware test smoke check before schema edits**

Run: `node --import tsx --test src/lib/admin-shop.test.ts`

Expected: PASS, confirming the workspace is clean before introducing the new generalized-product fixtures.

- [ ] **Step 3: Add Prisma models and enums**

Update [`prisma/schema.prisma`](/Volumes/T7/Code/Evory/prisma/schema.prisma) with new enums and models:

```prisma
enum CatalogProductType {
  COSMETIC
  SECRET_CREDENTIAL
}

enum ShopCurrencyType {
  POINTS
}

enum SecretInventoryStatus {
  AVAILABLE
  RESERVED
  SOLD
  VOID
}

enum PurchaseOrderStatus {
  PENDING
  FULFILLED
  FAILED
}

enum PurchaseDeliveryChannel {
  AGENT_CHAT
}

model CatalogProduct {
  id                String                @id @default(cuid())
  name              String
  description       String                @default("")
  productType       CatalogProductType
  price             Int
  currencyType      ShopCurrencyType      @default(POINTS)
  isActive          Boolean               @default(true)
  displayConfig     Json                  @default("{}")
  fulfillmentConfig Json                  @default("{}")
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt

  secretInventory   SecretInventory[]
  secretImportBatches SecretImportBatch[]
  purchaseOrders    PurchaseOrder[]

  @@index([productType, isActive])
}

model SecretImportBatch {
  id               String            @id @default(cuid())
  productId        String
  sourceLabel      String
  note             String            @default("")
  importedByUserId String
  importCount      Int
  createdAt        DateTime          @default(now())

  product          CatalogProduct    @relation(fields: [productId], references: [id], onDelete: Cascade)
  importedBy       User              @relation(fields: [importedByUserId], references: [id], onDelete: Cascade)
  inventory        SecretInventory[]
}

model SecretInventory {
  id             String               @id @default(cuid())
  productId      String
  maskedValue    String
  encryptedValue String
  status         SecretInventoryStatus @default(AVAILABLE)
  importBatchId  String?
  soldOrderId    String?              @unique
  createdAt      DateTime             @default(now())
  soldAt         DateTime?

  product        CatalogProduct       @relation(fields: [productId], references: [id], onDelete: Cascade)
  importBatch    SecretImportBatch?   @relation(fields: [importBatchId], references: [id], onDelete: SetNull)
  soldOrder      PurchaseOrder?       @relation("SoldSecretOrder", fields: [soldOrderId], references: [id], onDelete: SetNull)

  @@index([productId, status])
}

model PurchaseOrder {
  id              String                  @id @default(cuid())
  buyerAgentId    String
  productId       String
  pricePaid       Int
  currencyType    ShopCurrencyType
  status          PurchaseOrderStatus
  deliveryChannel PurchaseDeliveryChannel
  failureReason   String?
  fulfilledAt     DateTime?
  createdAt       DateTime                @default(now())

  buyerAgent      Agent                   @relation(fields: [buyerAgentId], references: [id], onDelete: Cascade)
  product         CatalogProduct          @relation(fields: [productId], references: [id], onDelete: Cascade)
  secretReceipt   SecretDeliveryReceipt?
  soldSecret      SecretInventory?        @relation("SoldSecretOrder")

  @@index([buyerAgentId, createdAt])
  @@index([productId, createdAt])
}

model SecretDeliveryReceipt {
  id                String         @id @default(cuid())
  orderId           String         @unique
  secretInventoryId String         @unique
  buyerAgentId      String
  deliveredAt       DateTime       @default(now())

  order             PurchaseOrder  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  secretInventory   SecretInventory @relation(fields: [secretInventoryId], references: [id], onDelete: Cascade)
  buyerAgent        Agent          @relation(fields: [buyerAgentId], references: [id], onDelete: Cascade)

  @@index([buyerAgentId, deliveredAt])
}
```

- [ ] **Step 4: Write the migration**

Create [`prisma/migrations/20260402_add_secret_shop_products/migration.sql`](/Volumes/T7/Code/Evory/prisma/migrations/20260402_add_secret_shop_products/migration.sql):

```sql
CREATE TYPE "CatalogProductType" AS ENUM ('COSMETIC', 'SECRET_CREDENTIAL');
CREATE TYPE "ShopCurrencyType" AS ENUM ('POINTS');
CREATE TYPE "SecretInventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'VOID');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'FULFILLED', 'FAILED');
CREATE TYPE "PurchaseDeliveryChannel" AS ENUM ('AGENT_CHAT');

CREATE TABLE "CatalogProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "productType" "CatalogProductType" NOT NULL,
  "price" INTEGER NOT NULL,
  "currencyType" "ShopCurrencyType" NOT NULL DEFAULT 'POINTS',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "fulfillmentConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecretImportBatch" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "importedByUserId" TEXT NOT NULL,
  "importCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecretImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "buyerAgentId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "pricePaid" INTEGER NOT NULL,
  "currencyType" "ShopCurrencyType" NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL,
  "deliveryChannel" "PurchaseDeliveryChannel" NOT NULL,
  "failureReason" TEXT,
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecretInventory" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "maskedValue" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "status" "SecretInventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
  "importBatchId" TEXT,
  "soldOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "soldAt" TIMESTAMP(3),
  CONSTRAINT "SecretInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecretDeliveryReceipt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "secretInventoryId" TEXT NOT NULL,
  "buyerAgentId" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecretDeliveryReceipt_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 5: Run Prisma format and focused tests**

Run: `npx prisma format && node --import tsx --test src/lib/admin-shop.test.ts`

Expected: Prisma schema formats cleanly and the existing admin-shop tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260402_add_secret_shop_products/migration.sql src/test/factories.ts
git commit -m "feat: add secret credential shop schema"
```

### Task 2: Add crypto and admin-domain helpers for secret products

**Files:**
- Create: `src/lib/secret-crypto.ts`
- Create: `src/lib/secret-crypto.test.ts`
- Create: `src/lib/admin-secret-products.ts`
- Create: `src/lib/admin-secret-products.test.ts`

- [ ] **Step 1: Write failing tests for masking, encryption, and admin payload parsing**

Create [`src/lib/secret-crypto.test.ts`](/Volumes/T7/Code/Evory/src/lib/secret-crypto.test.ts):

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptSecretValue,
  encryptSecretValue,
  maskSecretValue,
} from "./secret-crypto";

test("maskSecretValue keeps only the suffix visible", () => {
  assert.equal(maskSecretValue("sk-live-abcdef1234"), "sk-****1234");
});

test("encryptSecretValue round-trips with the configured key", () => {
  process.env.SECRET_INVENTORY_ENCRYPTION_KEY = "12345678901234567890123456789012";
  const encrypted = encryptSecretValue("sk-live-abcdef1234");
  assert.notEqual(encrypted, "sk-live-abcdef1234");
  assert.equal(decryptSecretValue(encrypted), "sk-live-abcdef1234");
});
```

Create [`src/lib/admin-secret-products.test.ts`](/Volumes/T7/Code/Evory/src/lib/admin-secret-products.test.ts):

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAdminSecretInventoryImportInput,
  parseAdminSecretProductInput,
} from "./admin-secret-products";

test("parseAdminSecretProductInput trims and validates secret products", () => {
  const parsed = parseAdminSecretProductInput({
    name: "  OpenRouter pack  ",
    description: "  One key  ",
    productType: "SECRET_CREDENTIAL",
    price: 300,
    isActive: true,
    displayConfig: { providerLabel: "OpenRouter" },
    fulfillmentConfig: { allowRepeatPurchase: true },
  });

  assert.equal(parsed.name, "OpenRouter pack");
  assert.equal(parsed.productType, "SECRET_CREDENTIAL");
});

test("parseAdminSecretInventoryImportInput deduplicates and trims input lines", () => {
  const parsed = parseAdminSecretInventoryImportInput({
    sourceLabel: "batch-1",
    note: "first load",
    secrets: " sk-1 \\n\\n sk-2 \\n sk-1 ",
  });

  assert.deepEqual(parsed.secrets, ["sk-1", "sk-2"]);
});
```

- [ ] **Step 2: Run the new tests to verify failure**

Run: `node --import tsx --test src/lib/secret-crypto.test.ts src/lib/admin-secret-products.test.ts`

Expected: FAIL because the helper modules do not exist yet.

- [ ] **Step 3: Implement secret crypto helpers**

Create [`src/lib/secret-crypto.ts`](/Volumes/T7/Code/Evory/src/lib/secret-crypto.ts):

```ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getSecretKey() {
  const raw = process.env.SECRET_INVENTORY_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SECRET_INVENTORY_ENCRYPTION_KEY is required");
  }
  return createHash("sha256").update(raw).digest();
}

export function maskSecretValue(value: string) {
  const trimmed = value.trim();
  const suffix = trimmed.slice(-4);
  const prefix = trimmed.startsWith("sk-") ? "sk-" : "";
  return `${prefix}****${suffix}`;
}

export function encryptSecretValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getSecretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecretValue(payload: string) {
  const [ivB64, tagB64, ciphertextB64] = payload.split(".");
  const decipher = createDecipheriv(ALGORITHM, getSecretKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
```

- [ ] **Step 4: Implement admin parsing helpers**

Create [`src/lib/admin-secret-products.ts`](/Volumes/T7/Code/Evory/src/lib/admin-secret-products.ts):

```ts
type SecretProductType = "SECRET_CREDENTIAL";

export type AdminSecretProductInput = {
  name: string;
  description: string;
  productType: SecretProductType;
  price: number;
  isActive: boolean;
  displayConfig: Record<string, unknown>;
  fulfillmentConfig: Record<string, unknown>;
};

export type AdminSecretInventoryImportInput = {
  sourceLabel: string;
  note: string;
  secrets: string[];
};

export class AdminSecretProductValidationError extends Error {}

function fail(message: string): never {
  throw new AdminSecretProductValidationError(message);
}

export function parseAdminSecretProductInput(body: unknown): AdminSecretProductInput {
  if (!body || typeof body !== "object") fail("Invalid request body");
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const productType = input.productType;
  const price = input.price;
  const isActive = input.isActive;
  const displayConfig =
    input.displayConfig && typeof input.displayConfig === "object"
      ? (input.displayConfig as Record<string, unknown>)
      : {};
  const fulfillmentConfig =
    input.fulfillmentConfig && typeof input.fulfillmentConfig === "object"
      ? (input.fulfillmentConfig as Record<string, unknown>)
      : {};

  if (!name) fail("name is required");
  if (productType !== "SECRET_CREDENTIAL") fail("productType must be SECRET_CREDENTIAL");
  if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
    fail("price must be a non-negative integer");
  }
  if (typeof isActive !== "boolean") fail("isActive is required");

  return { name, description, productType, price, isActive, displayConfig, fulfillmentConfig };
}

export function parseAdminSecretInventoryImportInput(body: unknown): AdminSecretInventoryImportInput {
  if (!body || typeof body !== "object") fail("Invalid request body");
  const input = body as Record<string, unknown>;
  const sourceLabel = typeof input.sourceLabel === "string" ? input.sourceLabel.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const secretsText = typeof input.secrets === "string" ? input.secrets : "";
  const secrets = [...new Set(secretsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];

  if (!sourceLabel) fail("sourceLabel is required");
  if (secrets.length === 0) fail("at least one secret is required");

  return { sourceLabel, note, secrets };
}
```

- [ ] **Step 5: Run the helper tests**

Run: `node --import tsx --test src/lib/secret-crypto.test.ts src/lib/admin-secret-products.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/secret-crypto.ts src/lib/secret-crypto.test.ts src/lib/admin-secret-products.ts src/lib/admin-secret-products.test.ts
git commit -m "feat: add secret product admin helpers"
```

### Task 3: Add admin APIs for secret products and secret inventory

**Files:**
- Create: `src/app/api/admin/shop/products/route.ts`
- Create: `src/app/api/admin/shop/products/route.test.ts`
- Create: `src/app/api/admin/shop/products/[id]/route.ts`
- Create: `src/app/api/admin/shop/products/[id]/route.test.ts`
- Create: `src/app/api/admin/shop/products/[id]/inventory/route.ts`
- Create: `src/app/api/admin/shop/products/[id]/inventory/route.test.ts`
- Create: `src/app/api/admin/shop/inventory/[inventoryId]/void/route.ts`
- Create: `src/app/api/admin/shop/inventory/[inventoryId]/void/route.test.ts`

- [ ] **Step 1: Write failing route tests for create, import, and void flows**

Create [`src/app/api/admin/shop/products/route.test.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/route.test.ts):

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route";
import { createRouteRequest } from "@/test/request-helpers";

test("POST creates a secret credential catalog product", async () => {
  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/products", {
      method: "POST",
      json: {
        name: "Provider Key Pack",
        description: "One key",
        productType: "SECRET_CREDENTIAL",
        price: 300,
        isActive: true,
        displayConfig: { providerLabel: "Provider" },
        fulfillmentConfig: { allowRepeatPurchase: true },
      },
    })
  );

  assert.equal(response.status, 200);
});
```

Create [`src/app/api/admin/shop/products/[id]/inventory/route.test.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/[id]/inventory/route.test.ts):

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route";
import { createRouteRequest, createRouteParams } from "@/test/request-helpers";

test("POST imports secret inventory rows with masked values", async () => {
  const response = await POST(
    createRouteRequest("http://localhost/api/admin/shop/products/product-1/inventory", {
      method: "POST",
      json: {
        sourceLabel: "batch-1",
        note: "",
        secrets: "sk-1\\nsk-2",
      },
    }),
    createRouteParams({ id: "product-1" })
  );

  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.data.importCount, 2);
});
```

- [ ] **Step 2: Run the new route tests to confirm failure**

Run: `node --import tsx --test src/app/api/admin/shop/products/route.test.ts src/app/api/admin/shop/products/[id]/inventory/route.test.ts`

Expected: FAIL because the routes do not exist yet.

- [ ] **Step 3: Implement product list/create and update routes**

Create [`src/app/api/admin/shop/products/route.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/route.ts):

```ts
import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import {
  AdminSecretProductValidationError,
  parseAdminSecretProductInput,
} from "@/lib/admin-secret-products";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const products = await prisma.catalogProduct.findMany({
    where: { productType: "SECRET_CREDENTIAL" },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { secretInventory: true, purchaseOrders: true } },
    },
  });

  return notForAgentsResponse(Response.json({
    success: true,
    data: products.map((product) => ({
      ...product,
      inventoryCount: product._count.secretInventory,
      orderCount: product._count.purchaseOrders,
    })),
  }));
}

export async function POST(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-products",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-shop-products",
    routeKey: "admin-shop-products",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  try {
    const data = parseAdminSecretProductInput(await request.json());
    const product = await prisma.catalogProduct.create({ data });
    return notForAgentsResponse(Response.json({ success: true, data: product }));
  } catch (error) {
    if (error instanceof AdminSecretProductValidationError || error instanceof SyntaxError) {
      return notForAgentsResponse(Response.json(
        { success: false, error: error instanceof SyntaxError ? "Invalid request body" : error.message },
        { status: 400 }
      ));
    }
    console.error("[admin/shop/products POST]", error);
    return notForAgentsResponse(Response.json({ success: false, error: "Internal server error" }, { status: 500 }));
  }
}
```

Create [`src/app/api/admin/shop/products/[id]/route.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/[id]/route.ts) with the same validation pattern for `PUT`.

- [ ] **Step 4: Implement inventory import and void routes**

Create [`src/app/api/admin/shop/products/[id]/inventory/route.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/[id]/inventory/route.ts):

```ts
import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import {
  AdminSecretProductValidationError,
  parseAdminSecretInventoryImportInput,
} from "@/lib/admin-secret-products";
import { encryptSecretValue, maskSecretValue } from "@/lib/secret-crypto";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-product-inventory-import",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const { id } = await params;

  try {
    const payload = parseAdminSecretInventoryImportInput(await request.json());
    const batch = await prisma.$transaction(async (tx) => {
      const importBatch = await tx.secretImportBatch.create({
        data: {
          productId: id,
          sourceLabel: payload.sourceLabel,
          note: payload.note,
          importedByUserId: auth.user.id,
          importCount: payload.secrets.length,
        },
      });

      await tx.secretInventory.createMany({
        data: payload.secrets.map((secret) => ({
          productId: id,
          importBatchId: importBatch.id,
          maskedValue: maskSecretValue(secret),
          encryptedValue: encryptSecretValue(secret),
        })),
      });

      return importBatch;
    });

    return notForAgentsResponse(Response.json({
      success: true,
      data: { importBatchId: batch.id, importCount: batch.importCount },
    }));
  } catch (error) {
    if (error instanceof AdminSecretProductValidationError || error instanceof SyntaxError) {
      return notForAgentsResponse(Response.json(
        { success: false, error: error instanceof SyntaxError ? "Invalid request body" : error.message },
        { status: 400 }
      ));
    }
    console.error("[admin/shop/products/:id/inventory POST]", error);
    return notForAgentsResponse(Response.json({ success: false, error: "Internal server error" }, { status: 500 }));
  }
}
```

Create [`src/app/api/admin/shop/inventory/[inventoryId]/void/route.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/inventory/[inventoryId]/void/route.ts):

```ts
import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-secret-inventory-void",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const { inventoryId } = await params;
  const row = await prisma.secretInventory.updateMany({
    where: { id: inventoryId, status: "AVAILABLE" },
    data: { status: "VOID" },
  });

  if (row.count === 0) {
    return notForAgentsResponse(Response.json(
      { success: false, error: "Available secret inventory not found" },
      { status: 404 }
    ));
  }

  return notForAgentsResponse(Response.json({ success: true }));
}
```

- [ ] **Step 5: Run the admin route test suite**

Run: `node --import tsx --test src/app/api/admin/shop/products/route.test.ts src/app/api/admin/shop/products/[id]/route.test.ts src/app/api/admin/shop/products/[id]/inventory/route.test.ts src/app/api/admin/shop/inventory/[inventoryId]/void/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/shop/products/route.ts src/app/api/admin/shop/products/route.test.ts src/app/api/admin/shop/products/[id]/route.ts src/app/api/admin/shop/products/[id]/route.test.ts src/app/api/admin/shop/products/[id]/inventory/route.ts src/app/api/admin/shop/products/[id]/inventory/route.test.ts src/app/api/admin/shop/inventory/[inventoryId]/void/route.ts src/app/api/admin/shop/inventory/[inventoryId]/void/route.test.ts
git commit -m "feat: add admin secret product routes"
```

### Task 4: Add transactional secret-product fulfillment to the unified purchase flow

**Files:**
- Create: `src/lib/secret-product-fulfillment.ts`
- Create: `src/lib/secret-product-fulfillment.test.ts`
- Modify: `src/app/api/points/shop/purchase/route.ts`
- Modify: `src/app/api/points/shop/shop-workflow.test.ts`
- Modify: `src/app/api/agent/shop/route.ts`
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`

- [ ] **Step 1: Write failing fulfillment tests**

Create [`src/lib/secret-product-fulfillment.test.ts`](/Volumes/T7/Code/Evory/src/lib/secret-product-fulfillment.test.ts):

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { fulfillSecretCredentialPurchase } from "./secret-product-fulfillment";

test("fulfillSecretCredentialPurchase marks inventory sold and returns the decrypted secret", async () => {
  const result = await fulfillSecretCredentialPurchase({
    agentId: "agent-1",
    productId: "product-1",
    prisma: {} as never,
  });

  assert.equal(result.delivery.type, "secret_credential");
  assert.match(result.delivery.secret, /^sk-/);
});
```

Add a new test to [`src/app/api/points/shop/shop-workflow.test.ts`](/Volumes/T7/Code/Evory/src/app/api/points/shop/shop-workflow.test.ts):

```ts
test("purchase fulfills secret credential products via productId", async () => {
  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: { productId: "product-1" },
    })
  );

  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.data.delivery.type, "secret_credential");
  assert.match(json.data.delivery.secret, /^sk-/);
});
```

- [ ] **Step 2: Run the failing purchase tests**

Run: `node --import tsx --test src/lib/secret-product-fulfillment.test.ts src/app/api/points/shop/shop-workflow.test.ts`

Expected: FAIL because the secret-fulfillment path does not exist.

- [ ] **Step 3: Implement the secret purchase transaction helper**

Create [`src/lib/secret-product-fulfillment.ts`](/Volumes/T7/Code/Evory/src/lib/secret-product-fulfillment.ts):

```ts
import { PointActionType } from "@/generated/prisma/client";

import { decryptSecretValue } from "@/lib/secret-crypto";
import { deductPoints } from "@/lib/points";
import prisma from "@/lib/prisma";

export class OutOfStockError extends Error {
  constructor() {
    super("Product is out of stock");
  }
}

export async function fulfillSecretCredentialPurchase({
  agentId,
  productId,
  prisma: db = prisma,
}: {
  agentId: string;
  productId: string;
  prisma?: typeof prisma;
}) {
  const product = await db.catalogProduct.findUnique({
    where: { id: productId },
  });

  if (!product || !product.isActive || product.productType !== "SECRET_CREDENTIAL") {
    throw new Error("Product not found");
  }

  const result = await db.$transaction(async (tx) => {
    const inventory = await tx.secretInventory.findFirst({
      where: { productId, status: "AVAILABLE" },
      orderBy: { createdAt: "asc" },
    });

    if (!inventory) throw new OutOfStockError();

    const deducted = await deductPoints(
      agentId,
      product.price,
      PointActionType.SHOP_PURCHASE,
      product.id,
      `Purchased: ${product.name}`,
      tx
    );
    if (!deducted) throw new Error("Insufficient points");

    const order = await tx.purchaseOrder.create({
      data: {
        buyerAgentId: agentId,
        productId: product.id,
        pricePaid: product.price,
        currencyType: product.currencyType,
        status: "FULFILLED",
        deliveryChannel: "AGENT_CHAT",
        fulfilledAt: new Date(),
      },
    });

    const soldInventory = await tx.secretInventory.update({
      where: { id: inventory.id },
      data: {
        status: "SOLD",
        soldOrderId: order.id,
        soldAt: new Date(),
      },
    });

    await tx.secretDeliveryReceipt.create({
      data: {
        orderId: order.id,
        secretInventoryId: soldInventory.id,
        buyerAgentId: agentId,
      },
    });

    return { order, inventory: soldInventory };
  });

  return {
    orderId: result.order.id,
    product: { id: product.id, name: product.name },
    delivery: {
      type: "secret_credential" as const,
      secret: decryptSecretValue(result.inventory.encryptedValue),
      masked: result.inventory.maskedValue,
      displayInstruction:
        "This credential is returned only in this purchase response. Store it securely.",
    },
  };
}
```

- [ ] **Step 4: Branch the existing purchase route by request shape**

Update [`src/app/api/points/shop/purchase/route.ts`](/Volumes/T7/Code/Evory/src/app/api/points/shop/purchase/route.ts):

```ts
import { fulfillSecretCredentialPurchase, OutOfStockError } from "@/lib/secret-product-fulfillment";

// inside POST after parsing body
const itemId = typeof body.itemId === "string" ? body.itemId : null;
const productId = typeof body.productId === "string" ? body.productId : null;

if (!itemId && !productId) {
  return notForAgentsResponse(Response.json(
    { success: false, error: "itemId or productId is required" },
    { status: 400 }
  ));
}

if (productId) {
  try {
    const fulfilled = await fulfillSecretCredentialPurchase({
      agentId: agent.id,
      productId,
    });
    return notForAgentsResponse(Response.json({ success: true, data: fulfilled }));
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return notForAgentsResponse(Response.json(
        { success: false, error: error.message },
        { status: 409 }
      ));
    }
    if (error instanceof Error && error.message === "Insufficient points") {
      return notForAgentsResponse(Response.json(
        { success: false, error: error.message },
        { status: 400 }
      ));
    }
    throw error;
  }
}

const legacyItemId = itemId;
```

Keep the current cosmetic code path unchanged below the new branch.

- [ ] **Step 5: Update the official Agent shop read surface**

Modify [`src/app/api/agent/shop/route.ts`](/Volumes/T7/Code/Evory/src/app/api/agent/shop/route.ts) so `GET` returns both:

- the existing cosmetic catalog from `/api/points/shop`
- active secret credential products from `CatalogProduct`

Use a response shape like:

```ts
return officialAgentResponse(Response.json({
  success: true,
  data: {
    cosmetics,
    secretProducts: secretProducts.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      productType: product.productType,
      providerLabel: (product.displayConfig as Record<string, unknown>).providerLabel ?? null,
    })),
  },
}));
```

- [ ] **Step 6: Run the fulfillment and Agent API test suite**

Run: `node --import tsx --test src/lib/secret-product-fulfillment.test.ts src/app/api/points/shop/shop-workflow.test.ts src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/secret-product-fulfillment.ts src/lib/secret-product-fulfillment.test.ts src/app/api/points/shop/purchase/route.ts src/app/api/points/shop/shop-workflow.test.ts src/app/api/agent/shop/route.ts src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts
git commit -m "feat: fulfill secret credential shop purchases"
```

### Task 5: Add admin UI for secret products and inventory import

**Files:**
- Create: `src/app/admin/admin-secret-products-panel.tsx`
- Create: `src/app/admin/admin-secret-products-panel.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/admin-tabs.tsx`
- Modify: `src/app/admin/admin-tabs.test.tsx`
- Modify: `src/lib/shop-client.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/translations.test.ts`

- [ ] **Step 1: Write failing UI tests**

Create [`src/app/admin/admin-secret-products-panel.test.tsx`](/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.test.tsx):

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminSecretProductsPanel } from "./admin-secret-products-panel";

test("AdminSecretProductsPanel renders provider fields and inventory import textarea", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[]}
      loading={false}
      onRefresh={async () => {}}
      onError={() => {}}
      onSuccess={() => {}}
    />
  );

  assert.match(html, /admin\.secretProducts\.form\.providerLabel/);
  assert.match(html, /admin\.secretProducts\.inventory\.textarea/);
});
```

Add a tab test to [`src/app/admin/admin-tabs.test.tsx`](/Volumes/T7/Code/Evory/src/app/admin/admin-tabs.test.tsx):

```ts
test("normalizeAdminPrimaryTab recognizes products", () => {
  assert.equal(normalizeAdminPrimaryTab("products"), "products");
});
```

- [ ] **Step 2: Run the UI tests to verify failure**

Run: `node --import tsx --test src/app/admin/admin-tabs.test.tsx src/app/admin/admin-secret-products-panel.test.tsx src/i18n/translations.test.ts`

Expected: FAIL because the new panel and translation keys do not exist.

- [ ] **Step 3: Implement the secret-products admin panel**

Create [`src/app/admin/admin-secret-products-panel.tsx`](/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.tsx):

```tsx
"use client";

import { useState, type FormEvent } from "react";

import type { TranslationKey } from "@/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminSecretProductsPanel({
  t,
  products,
  loading,
  onRefresh,
  onError,
  onSuccess,
}: {
  t: (key: TranslationKey) => string;
  products: Array<Record<string, unknown>>;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    price: 0,
    providerLabel: "",
    usageInstructions: "",
    allowRepeatPurchase: true,
  });
  const [inventoryDraft, setInventoryDraft] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    onSuccess(null);
    const response = await fetch("/api/admin/shop/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        productType: "SECRET_CREDENTIAL",
        price: draft.price,
        isActive: true,
        displayConfig: {
          providerLabel: draft.providerLabel,
          usageInstructions: draft.usageInstructions,
        },
        fulfillmentConfig: {
          allowRepeatPurchase: draft.allowRepeatPurchase,
        },
      }),
    });
    const json = await response.json();
    if (!json.success) return onError(json.error || t("admin.actionFailed"));
    onSuccess(t("admin.secretProducts.createSuccess"));
    await onRefresh();
  }

  return <Card>{t("admin.secretProducts.title")}</Card>;
}
```

- [ ] **Step 4: Wire the panel into the admin page and translations**

Update [`src/app/admin/admin-tabs.tsx`](/Volumes/T7/Code/Evory/src/app/admin/admin-tabs.tsx):

```ts
export type AdminPrimaryTab = "forum" | "shop" | "products" | "site" | "knowledge";

const ADMIN_PRIMARY_TABS: AdminPrimaryTab[] = ["forum", "shop", "products", "site", "knowledge"];

export function normalizeAdminPrimaryTab(value: string | null): AdminPrimaryTab {
  if (value === "shop" || value === "products" || value === "site" || value === "knowledge") {
    return value;
  }
  return "forum";
}
```

Update [`src/app/admin/page.tsx`](/Volumes/T7/Code/Evory/src/app/admin/page.tsx) to load secret products when `activePrimaryTab === "products"` and render `<AdminSecretProductsPanel />`.

Add translation keys in [`src/i18n/en.ts`](/Volumes/T7/Code/Evory/src/i18n/en.ts) and [`src/i18n/zh.ts`](/Volumes/T7/Code/Evory/src/i18n/zh.ts):

```ts
"admin.secretProducts.title": "Secret Products",
"admin.secretProducts.createSuccess": "Secret product created",
"admin.secretProducts.form.providerLabel": "Provider",
"admin.secretProducts.inventory.textarea": "Secrets",
```

- [ ] **Step 5: Run the admin UI and translation tests**

Run: `node --import tsx --test src/app/admin/admin-tabs.test.tsx src/app/admin/admin-secret-products-panel.test.tsx src/i18n/translations.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/admin-secret-products-panel.tsx src/app/admin/admin-secret-products-panel.test.tsx src/app/admin/page.tsx src/app/admin/admin-tabs.tsx src/app/admin/admin-tabs.test.tsx src/lib/shop-client.ts src/i18n/en.ts src/i18n/zh.ts src/i18n/translations.test.ts
git commit -m "feat: add admin secret products panel"
```

### Task 6: Verify the full flow and tighten regressions

**Files:**
- Modify: `src/app/api/points/shop/shop-workflow.test.ts`
- Modify: `src/app/api/admin/shop/products/route.test.ts`
- Modify: `src/app/api/admin/shop/products/[id]/inventory/route.test.ts`
- Modify: `src/app/admin/admin-secret-products-panel.test.tsx`

- [ ] **Step 1: Add end-to-end regression cases**

Extend [`src/app/api/points/shop/shop-workflow.test.ts`](/Volumes/T7/Code/Evory/src/app/api/points/shop/shop-workflow.test.ts):

```ts
test("secret product purchase returns 409 when stock is exhausted", async () => {
  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: { productId: "product-out" },
    })
  );
  const json = await response.json();
  assert.equal(response.status, 409);
  assert.equal(json.error, "Product is out of stock");
});

test("legacy cosmetic purchase still accepts itemId", async () => {
  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: { itemId: "crown" },
    })
  );
  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Run the full targeted suite**

Run: `node --import tsx --test src/lib/secret-crypto.test.ts src/lib/admin-secret-products.test.ts src/lib/secret-product-fulfillment.test.ts src/app/api/points/shop/shop-workflow.test.ts src/app/api/admin/shop/products/route.test.ts src/app/api/admin/shop/products/[id]/route.test.ts src/app/api/admin/shop/products/[id]/inventory/route.test.ts src/app/api/admin/shop/inventory/[inventoryId]/void/route.test.ts src/app/admin/admin-secret-products-panel.test.tsx src/app/admin/admin-tabs.test.tsx src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts src/i18n/translations.test.ts`

Expected: PASS.

- [ ] **Step 3: Run Prisma validation**

Run: `npx prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 4: Review changed files for secret leakage**

Manually inspect responses and admin serializers to confirm that:

- `encryptedValue` never appears in JSON responses
- plaintext `secret` appears only in the successful secret purchase response
- admin inventory endpoints expose `maskedValue` only

Use:

```bash
rg -n "encryptedValue|secret" src/app/api src/lib
```

Expected: only the purchase success serializer includes plaintext `secret`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/points/shop/shop-workflow.test.ts src/app/api/admin/shop/products/route.test.ts src/app/api/admin/shop/products/[id]/inventory/route.test.ts src/app/admin/admin-secret-products-panel.test.tsx
git commit -m "test: cover secret credential shop flow"
```

---

## Self-Review

### Spec coverage

- generalized product model: covered by Task 1
- secret inventory and import batches: covered by Tasks 1 and 3
- purchase orders and delivery receipts: covered by Tasks 1 and 4
- Agent purchase with direct secret delivery: covered by Task 4
- admin creation and inventory management: covered by Tasks 3 and 5
- security and one-time delivery constraints: covered by Tasks 2, 4, and 6
- cosmetic compatibility strategy 1: covered by Tasks 4 and 6

### Placeholder scan

- no `TODO`, `TBD`, or deferred steps remain
- each task names exact files
- each code-changing step includes concrete code to start from
- each verification step includes explicit commands and expected outcomes

### Type consistency

- generalized product type is consistently `SECRET_CREDENTIAL`
- request compatibility consistently uses legacy `itemId` for cosmetics and `productId` for secret products
- purchase responses consistently use `delivery.type = "secret_credential"`

