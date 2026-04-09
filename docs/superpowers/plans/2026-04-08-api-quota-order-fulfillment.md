# API Quota Order Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace secret credential products with API quota products that create pending point-paid orders, let admins manage reusable provided API keys, and let admins fulfill orders by assigning a key and confirming completion.

**Architecture:** Keep `ShopItem` for cosmetics and keep `CatalogProduct` plus `PurchaseOrder` for non-cosmetic commerce, but migrate the non-cosmetic branch from instant secret delivery to quota-order fulfillment. Add a reusable `ProvidedApiKey` model, copy quota metadata into `PurchaseOrder` at purchase time, and rework admin tooling from inventory import into key management plus order confirmation.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Prisma, PostgreSQL, node:test, existing admin auth/rate-limit/request-security helpers, existing i18n dictionaries.

---

### Task 1: Migrate schema and fixtures to API quota orders

**Files:**
- Create: `prisma/migrations/20260408_api_quota_order_fulfillment/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/test/factories.ts`
- Test: `src/app/api/admin/shop/products/route.test.ts`
- Test: `src/app/api/points/shop/shop-workflow.test.ts`

- [ ] **Step 1: Update the failing tests first**

Change existing product and purchase tests so they expect `API_QUOTA`, quota metadata, and pending orders instead of `SECRET_CREDENTIAL` and instant secret delivery.

```ts
assert.deepEqual(createdData, {
  name: "Provider quota pack",
  description: "10k tokens",
  productType: "API_QUOTA",
  price: 300,
  isActive: true,
  displayConfig: {
    providerLabel: "Provider",
    quotaUnitLabel: "tokens",
  },
  fulfillmentConfig: {
    quotaAmount: 10000,
    allowRepeatPurchase: true,
  },
});
```

```ts
assert.equal(json.data.status, "PENDING");
assert.deepEqual(json.data.quota, {
  amount: 10000,
  unit: "tokens",
});
assert.equal("delivery" in json.data, false);
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/app/api/admin/shop/products/route.test.ts src/app/api/points/shop/shop-workflow.test.ts`

Expected: FAIL because the schema, fixtures, and route logic still use `SECRET_CREDENTIAL` and secret-delivery fields.

- [ ] **Step 3: Update the Prisma schema**

Apply these schema changes:

```prisma
enum CatalogProductType {
  COSMETIC
  API_QUOTA
}

model ProvidedApiKey {
  id              String   @id @default(cuid())
  label           String
  providerLabel   String
  maskedKey       String
  encryptedKey    String
  isActive        Boolean  @default(true)
  createdByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  createdBy User            @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)
  orders    PurchaseOrder[]
}

model PurchaseOrder {
  id                String                  @id @default(cuid())
  buyerAgentId      String
  productId         String
  pricePaid         Int
  currencyType      ShopCurrencyType        @default(POINTS)
  status            PurchaseOrderStatus     @default(PENDING)
  deliveryChannel   PurchaseDeliveryChannel @default(AGENT_CHAT)
  failureReason     String?
  quotaAmount       Int
  quotaUnitLabel    String
  providedApiKeyId  String?
  confirmedByUserId String?
  confirmedAt       DateTime?
  fulfilledAt       DateTime?
  createdAt         DateTime                @default(now())

  buyerAgent     Agent           @relation(fields: [buyerAgentId], references: [id], onDelete: Cascade)
  product        CatalogProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  providedApiKey ProvidedApiKey? @relation(fields: [providedApiKeyId], references: [id], onDelete: SetNull)
  confirmedBy    User?           @relation(fields: [confirmedByUserId], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 4: Write the migration and update fixtures**

Migration core:

```sql
ALTER TYPE "CatalogProductType" RENAME VALUE 'SECRET_CREDENTIAL' TO 'API_QUOTA';
ALTER TABLE "PurchaseOrder" ADD COLUMN "quotaAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "quotaUnitLabel" TEXT NOT NULL DEFAULT 'credits';
ALTER TABLE "PurchaseOrder" ADD COLUMN "providedApiKeyId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "confirmedByUserId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "confirmedAt" TIMESTAMP(3);
```

Factory core:

```ts
export function createCatalogProductFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "API Quota Pack",
    description: "",
    productType: "API_QUOTA",
    price: 300,
    currencyType: "POINTS",
    isActive: true,
    displayConfig: {
      providerLabel: "OpenAI",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
    },
    ...overrides,
  };
}
```

- [ ] **Step 5: Run the same tests again**

Run: `npm test -- src/app/api/admin/shop/products/route.test.ts src/app/api/points/shop/shop-workflow.test.ts`

Expected: FAIL later in route assertions, not on enum/value mismatches.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260408_api_quota_order_fulfillment/migration.sql src/test/factories.ts src/app/api/admin/shop/products/route.test.ts src/app/api/points/shop/shop-workflow.test.ts
git commit -m "refactor: migrate shop schema to api quota orders"
```

### Task 2: Replace admin secret-product parsing with API quota parsing

**Files:**
- Create: `src/lib/admin-api-quota-products.ts`
- Create: `src/lib/admin-api-quota-products.test.ts`
- Modify: `src/app/api/admin/shop/products/route.ts`
- Modify: `src/app/api/admin/shop/products/[id]/route.ts`
- Modify: `src/app/api/admin/shop/products/route.test.ts`

- [ ] **Step 1: Write the failing parser tests**

```ts
test("parseAdminApiQuotaProductInput accepts a valid api quota product", () => {
  const parsed = parseAdminApiQuotaProductInput({
    name: "OpenAI quota",
    description: "10k tokens",
    productType: "API_QUOTA",
    price: 200,
    isActive: true,
    displayConfig: {
      providerLabel: "OpenAI",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
    },
  });

  assert.equal(parsed.productType, "API_QUOTA");
  assert.equal(parsed.fulfillmentConfig.quotaAmount, 10000);
});
```

- [ ] **Step 2: Run the parser test**

Run: `node --import tsx --test src/lib/admin-api-quota-products.test.ts`

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement the parser**

Create a dedicated quota parser instead of extending `admin-secret-products`:

```ts
export function parseAdminApiQuotaProductInput(body: unknown): AdminApiQuotaProductInput {
  if (!displayConfig || !isNonEmptyString(displayConfig.providerLabel)) {
    validationError("displayConfig.providerLabel is required");
  }
  if (!isNonEmptyString(displayConfig.quotaUnitLabel)) {
    validationError("displayConfig.quotaUnitLabel is required");
  }
  if (
    typeof fulfillmentConfig.quotaAmount !== "number" ||
    !Number.isInteger(fulfillmentConfig.quotaAmount) ||
    fulfillmentConfig.quotaAmount < 1
  ) {
    validationError("fulfillmentConfig.quotaAmount must be a positive integer");
  }

  return {
    name,
    description,
    productType: "API_QUOTA",
    price,
    isActive,
    displayConfig,
    fulfillmentConfig,
  };
}
```

- [ ] **Step 4: Wire the product routes**

Update both routes to depend on the new parser and type:

```ts
const data = parseAdminApiQuotaProductInput(await request.json());

const existingProduct = await prisma.catalogProduct.findFirst({
  where: {
    id,
    productType: "API_QUOTA",
  },
  select: { id: true },
});
```

- [ ] **Step 5: Re-run the parser and route tests**

Run: `npm test -- src/lib/admin-api-quota-products.test.ts src/app/api/admin/shop/products/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-api-quota-products.ts src/lib/admin-api-quota-products.test.ts src/app/api/admin/shop/products/route.ts src/app/api/admin/shop/products/[id]/route.ts src/app/api/admin/shop/products/route.test.ts
git commit -m "feat: add admin api quota product validation"
```

### Task 3: Add provided API key management endpoints

**Files:**
- Create: `src/lib/admin-provided-api-keys.ts`
- Create: `src/lib/admin-provided-api-keys.test.ts`
- Create: `src/app/api/admin/shop/api-keys/route.ts`
- Create: `src/app/api/admin/shop/api-keys/route.test.ts`
- Create: `src/app/api/admin/shop/api-keys/[id]/route.ts`
- Create: `src/app/api/admin/shop/api-keys/[id]/route.test.ts`

- [ ] **Step 1: Write the failing parser and route tests**

Parser test:

```ts
test("parseAdminProvidedApiKeyInput accepts a new provided key", () => {
  const parsed = parseAdminProvidedApiKeyInput({
    label: "Primary OpenAI key",
    providerLabel: "OpenAI",
    apiKey: "sk-live-123456789",
    isActive: true,
  });

  assert.equal(parsed.label, "Primary OpenAI key");
  assert.equal(parsed.providerLabel, "OpenAI");
});
```

Create-route assertion:

```ts
assert.equal(createdData.label, "Primary OpenAI key");
assert.equal(createdData.providerLabel, "OpenAI");
assert.equal(createdData.maskedKey, "sk-****6789");
assert.equal(createdData.createdByUserId, "admin-1");
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- src/lib/admin-provided-api-keys.test.ts src/app/api/admin/shop/api-keys/route.test.ts src/app/api/admin/shop/api-keys/[id]/route.test.ts`

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Implement provided-key parsing**

```ts
export function parseAdminProvidedApiKeyInput(body: unknown): AdminProvidedApiKeyInput {
  if (!isNonEmptyString(label)) validationError("label is required");
  if (!isNonEmptyString(providerLabel)) validationError("providerLabel is required");
  if (!isNonEmptyString(apiKey)) validationError("apiKey is required");

  return {
    label: label.trim(),
    providerLabel: providerLabel.trim(),
    apiKey: apiKey.trim(),
    isActive: typeof isActive === "boolean" ? isActive : true,
  };
}
```

- [ ] **Step 4: Implement list/create/update routes**

Create route core:

```ts
const payload = parseAdminProvidedApiKeyInput(await request.json());
const created = await prisma.providedApiKey.create({
  data: {
    label: payload.label,
    providerLabel: payload.providerLabel,
    maskedKey: maskSecretValue(payload.apiKey),
    encryptedKey: encryptSecretValue(payload.apiKey),
    isActive: payload.isActive,
    createdByUserId: auth.user.id,
  },
});
```

Update route core:

```ts
await prisma.providedApiKey.update({
  where: { id },
  data: {
    label: payload.label,
    providerLabel: payload.providerLabel,
    isActive: payload.isActive,
  },
});
```

- [ ] **Step 5: Re-run the new tests**

Run: `npm test -- src/lib/admin-provided-api-keys.test.ts src/app/api/admin/shop/api-keys/route.test.ts src/app/api/admin/shop/api-keys/[id]/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-provided-api-keys.ts src/lib/admin-provided-api-keys.test.ts src/app/api/admin/shop/api-keys/route.ts src/app/api/admin/shop/api-keys/route.test.ts src/app/api/admin/shop/api-keys/[id]/route.ts src/app/api/admin/shop/api-keys/[id]/route.test.ts
git commit -m "feat: add admin provided api key management"
```

### Task 4: Replace instant secret delivery with pending quota-order creation

**Files:**
- Modify: `src/app/api/points/shop/purchase/route.ts`
- Modify: `src/app/api/points/shop/route.ts`
- Modify: `src/app/api/agent/shop/route.ts`
- Modify: `src/lib/shop-client.ts`
- Modify: `src/app/api/points/shop/shop-workflow.test.ts`

- [ ] **Step 1: Rewrite the failing purchase and catalog tests**

Update the purchase test:

```ts
test("purchase creates a pending api quota order via productId", async () => {
  const response = await purchaseItem(
    createRouteRequest("http://localhost/api/points/shop/purchase", {
      method: "POST",
      apiKey: "agent-key",
      json: { productId: "product-1" },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.status, "PENDING");
  assert.deepEqual(json.data.quota, { amount: 10000, unit: "tokens" });
  assert.equal("delivery" in json.data, false);
});
```

Update catalog expectations:

```ts
assert.equal(json.data[0].entryType, "api_quota_product");
assert.equal(json.data[0].quotaAmount, 10000);
assert.equal(json.data[0].quotaUnitLabel, "tokens");
assert.equal("availableInventoryCount" in json.data[0], false);
```

- [ ] **Step 2: Run the workflow tests**

Run: `npm test -- src/app/api/points/shop/shop-workflow.test.ts`

Expected: FAIL because the route still calls secret fulfillment and the catalog still emits secret-product fields.

- [ ] **Step 3: Replace the `productId` purchase branch**

Update `src/app/api/points/shop/purchase/route.ts` so `productId` purchases create pending orders:

```ts
const product = await prisma.catalogProduct.findUnique({
  where: { id: productId },
});

if (!product || !product.isActive || product.productType !== "API_QUOTA") {
  return notForAgentsResponse(
    Response.json({ success: false, error: "Product not found" }, { status: 404 })
  );
}

const fulfillmentConfig = product.fulfillmentConfig as Record<string, unknown>;
const displayConfig = product.displayConfig as Record<string, unknown>;
const quotaAmount = Number(fulfillmentConfig.quotaAmount ?? 0);
const quotaUnitLabel = String(displayConfig.quotaUnitLabel ?? "credits");

const order = await prisma.$transaction(async (tx) => {
  const deducted = await deductPoints(
    agent.id,
    product.price,
    PointActionType.SHOP_PURCHASE,
    product.id,
    `Purchased: ${product.name}`,
    tx
  );

  if (!deducted) {
    throw new InsufficientPointsError();
  }

  return tx.purchaseOrder.create({
    data: {
      buyerAgentId: agent.id,
      productId: product.id,
      pricePaid: product.price,
      currencyType: product.currencyType,
      status: "PENDING",
      deliveryChannel: "AGENT_CHAT",
      quotaAmount,
      quotaUnitLabel,
    },
  });
});
```

- [ ] **Step 4: Update catalog and client serialization**

Public shop route:

```ts
return {
  entryType: "api_quota_product" as const,
  id: product.id,
  name: product.name,
  description: product.description,
  price: product.price,
  currencyType: product.currencyType,
  providerLabel: readString(displayConfig.providerLabel),
  usageInstructions: readString(displayConfig.usageInstructions),
  quotaAmount,
  quotaUnitLabel,
  allowRepeatPurchase,
  perAgentPurchaseLimit,
};
```

Client types:

```ts
export type PublicShopCatalogEntryType = "cosmetic" | "api_quota_product";

export type PublicShopCatalogApiQuotaEntry = {
  entryType: "api_quota_product";
  id: string;
  name: string;
  description: string;
  price: number;
  currencyType: ShopCurrencyType;
  providerLabel: string | null;
  usageInstructions: string | null;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};
```

- [ ] **Step 5: Re-run the workflow tests**

Run: `npm test -- src/app/api/points/shop/shop-workflow.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/points/shop/purchase/route.ts src/app/api/points/shop/route.ts src/app/api/agent/shop/route.ts src/lib/shop-client.ts src/app/api/points/shop/shop-workflow.test.ts
git commit -m "feat: create pending api quota orders"
```

### Task 5: Expose admin fulfillment and updated order history

**Files:**
- Create: `src/app/api/admin/shop/orders/[id]/fulfill/route.ts`
- Create: `src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`
- Modify: `src/app/api/admin/shop/orders/route.ts`
- Modify: `src/app/api/admin/shop/orders/route.test.ts`
- Modify: `src/app/api/agent/shop/orders/route.ts`
- Modify: `src/app/api/agent/shop/orders/route.test.ts`

- [ ] **Step 1: Update the failing admin and Agent order tests**

Admin route expectation:

```ts
assert.deepEqual(json.data[0], {
  id: "order-1",
  status: "FULFILLED",
  pricePaid: 300,
  currencyType: "POINTS",
  deliveryChannel: "AGENT_CHAT",
  failureReason: null,
  createdAt: "2026-04-07T10:00:00.000Z",
  fulfilledAt: "2026-04-07T10:01:00.000Z",
  confirmedAt: "2026-04-07T10:01:00.000Z",
  quota: { amount: 10000, unit: "tokens" },
  product: { id: "product-1", name: "Provider Pack", isActive: true },
  buyer: {
    agentId: "agent-2",
    name: "Buyer Agent",
    type: "CUSTOM",
    ownerUserId: "user-2",
  },
  providedApiKey: {
    id: "key-1",
    label: "Primary OpenAI key",
    maskedKey: "sk-****1234",
    providerLabel: "OpenAI",
  },
});
```

Fulfill-route expectation:

```ts
assert.equal(updatedData.status, "FULFILLED");
assert.equal(updatedData.providedApiKeyId, "key-1");
assert.equal(updatedData.confirmedByUserId, "admin-1");
```

- [ ] **Step 2: Run the order tests**

Run: `npm test -- src/app/api/admin/shop/orders/route.test.ts src/app/api/agent/shop/orders/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`

Expected: FAIL because the routes still select `secretReceipt` fields and the fulfill route does not exist.

- [ ] **Step 3: Update order list routes**

Admin select shape:

```ts
select: {
  id: true,
  status: true,
  pricePaid: true,
  currencyType: true,
  deliveryChannel: true,
  failureReason: true,
  quotaAmount: true,
  quotaUnitLabel: true,
  createdAt: true,
  fulfilledAt: true,
  confirmedAt: true,
  product: {
    select: { id: true, name: true, isActive: true },
  },
  buyerAgent: {
    select: { id: true, name: true, type: true, ownerUserId: true },
  },
  providedApiKey: {
    select: { id: true, label: true, maskedKey: true, providerLabel: true },
  },
}
```

Agent route should use the same quota/provided-key fields but omit buyer data.

- [ ] **Step 4: Implement the fulfill route**

Use one atomic update after validating order and key state:

```ts
const order = await prisma.purchaseOrder.findFirst({
  where: {
    id,
    status: "PENDING",
    product: { productType: "API_QUOTA" },
  },
  select: { id: true },
});

const key = await prisma.providedApiKey.findFirst({
  where: { id: payload.providedApiKeyId, isActive: true },
  select: { id: true },
});

const updated = await prisma.purchaseOrder.update({
  where: { id },
  data: {
    status: "FULFILLED",
    providedApiKeyId: payload.providedApiKeyId,
    confirmedByUserId: auth.user.id,
    confirmedAt: new Date(),
    fulfilledAt: new Date(),
  },
});
```

- [ ] **Step 5: Re-run the order tests**

Run: `npm test -- src/app/api/admin/shop/orders/route.test.ts src/app/api/agent/shop/orders/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/shop/orders/route.ts src/app/api/admin/shop/orders/route.test.ts src/app/api/agent/shop/orders/route.ts src/app/api/agent/shop/orders/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts
git commit -m "feat: add api quota order fulfillment routes"
```

### Task 6: Rework the admin panel and copy for quota products, provided keys, and fulfillment

**Files:**
- Modify: `src/app/admin/admin-secret-products-panel.tsx`
- Modify: `src/app/admin/admin-secret-products-panel.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/lib/shop-client.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Update the failing panel tests**

Replace inventory expectations with provided-key and fulfillment expectations:

```ts
assert.match(markup, /quota amount/i);
assert.match(markup, /provided api keys/i);
assert.match(markup, /pending orders/i);
assert.doesNotMatch(markup, /inventory import/i);
```

- [ ] **Step 2: Run the panel test**

Run: `npm test -- src/app/admin/admin-secret-products-panel.test.tsx`

Expected: FAIL because the panel still renders secret inventory controls and old copy.

- [ ] **Step 3: Refactor the panel behavior**

Keep the file path for now, but change the responsibilities:

```ts
type ProductDraft = {
  name: string;
  description: string;
  price: number;
  providerLabel: string;
  usageInstructions: string;
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimitMode: "unlimited" | "limited";
  perAgentPurchaseLimit: number | null;
};
```

Add admin fetch helpers for keys and fulfillment:

```ts
const [apiKeys, setApiKeys] = useState<AdminProvidedApiKey[]>([]);
const [selectedKeyByOrder, setSelectedKeyByOrder] = useState<Record<string, string>>({});

await fulfillAdminQuotaOrder(fetch, order.id, {
  providedApiKeyId: selectedKeyByOrder[order.id],
});
```

Remove the inventory import section entirely and replace it with:
- provided API key create/list section
- pending orders section with per-order key selector and fulfill button

- [ ] **Step 4: Update page loader and translation keys**

Page loader rename example:

```ts
import { fetchAdminApiQuotaProducts, type AdminApiQuotaProduct } from "@/lib/shop-client";
```

Translation keys should replace old secret wording with quota wording, for example:

```ts
"admin.products.form.quotaAmount": "Quota amount",
"admin.products.form.quotaUnitLabel": "Quota unit",
"admin.products.keys.title": "Provided API keys",
"admin.products.orders.fulfill": "Confirm fulfillment",
```

- [ ] **Step 5: Re-run the panel test and one API smoke set**

Run: `npm test -- src/app/admin/admin-secret-products-panel.test.tsx src/app/api/admin/shop/orders/route.test.ts src/app/api/admin/shop/api-keys/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/admin-secret-products-panel.tsx src/app/admin/admin-secret-products-panel.test.tsx src/app/admin/page.tsx src/lib/shop-client.ts src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat: update admin ui for api quota fulfillment"
```

### Task 7: Final regression run and cleanup

**Files:**
- Modify: `src/lib/secret-product-fulfillment.ts`
- Modify: `src/lib/admin-secret-products.ts`
- Test: `src/app/api/admin/shop/products/route.test.ts`
- Test: `src/app/api/admin/shop/api-keys/route.test.ts`
- Test: `src/app/api/admin/shop/orders/route.test.ts`
- Test: `src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts`
- Test: `src/app/api/agent/shop/orders/route.test.ts`
- Test: `src/app/api/points/shop/shop-workflow.test.ts`
- Test: `src/app/admin/admin-secret-products-panel.test.tsx`

- [ ] **Step 1: Remove new-code references to retired secret helpers**

Either delete the dead code or leave an explicit guard comment, but no live route should import it:

```ts
// Legacy module retained only for historical reference. New quota orders must not import this file.
export {};
```

Likewise stop using `parseAdminSecretProductInput` in live routes once the quota parser is in place.

- [ ] **Step 2: Run the targeted regression set**

Run:

```bash
npm test -- src/app/api/admin/shop/products/route.test.ts src/app/api/admin/shop/api-keys/route.test.ts src/app/api/admin/shop/orders/route.test.ts src/app/api/admin/shop/orders/[id]/fulfill/route.test.ts src/app/api/agent/shop/orders/route.test.ts src/app/api/points/shop/shop-workflow.test.ts src/app/admin/admin-secret-products-panel.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run the full suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/secret-product-fulfillment.ts src/lib/admin-secret-products.ts
git commit -m "chore: retire secret product fulfillment path"
```

## Self-Review

- Spec coverage: Task 1 covers schema and migration, Task 2 covers admin quota product validation, Task 3 covers provided API key management, Task 4 covers pending-order purchase flow and shop serialization, Task 5 covers admin fulfillment plus admin/Agent order history, Task 6 covers admin UI and copy updates, and Task 7 covers cleanup plus regression verification.
- Placeholder scan: no `TODO`, `TBD`, or “similar to above” placeholders remain; each task includes concrete files, snippets, commands, and expected outcomes.
- Type consistency: the plan uses `API_QUOTA`, `ProvidedApiKey`, `quotaAmount`, `quotaUnitLabel`, and `providedApiKeyId` consistently across schema, route, client, and UI tasks.
