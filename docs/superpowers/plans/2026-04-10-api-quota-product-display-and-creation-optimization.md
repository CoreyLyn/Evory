# API Quota Product Display And Creation Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align API quota products with the current quota-order business model, then improve admin creation efficiency and storefront clarity in priority order.

**Architecture:** Start by removing stale secret-inventory semantics from the admin product API, client types, and operator-facing docs so the data contract matches the live quota-order workflow. Then tighten naming and copy, rework the admin creation surface around a small helper module plus richer controls, and finally improve storefront discovery with stronger card/drawer content and better quota-specific search behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, node:test, React DOM server rendering tests, i18n translation dictionaries

---

## File Structure

### Existing Files To Modify

- `src/app/api/admin/shop/products/route.ts`
  Removes legacy secret inventory aggregation from the admin quota product list response.
- `src/app/api/admin/shop/products/route.test.ts`
  Rewrites route expectations around quota-order metadata only.
- `src/lib/shop-client.ts`
  Updates admin quota product types and request helpers to match the new response contract.
- `src/lib/shop-client.test.ts`
  Covers the updated admin quota product response parsing and payload generation.
- `src/lib/agent-public-documents.ts`
  Removes stale `secretProducts` and inventory wording from the agent-facing API reference.
- `src/i18n/zh.ts`
  Replaces stale secret/inventory wording with quota-order wording and adds copy for new UI states.
- `src/i18n/en.ts`
  English mirror of the quota-order wording and new UI keys.
- `src/app/admin/admin-secret-products-panel.tsx`
  Reworks the admin quota product editor, list summaries, and inline product preview.
- `src/app/admin/admin-secret-products-panel.test.tsx`
  Verifies the new quota-product form controls and summary rendering.
- `src/components/shop/item-card.tsx`
  Expands compact quota card content with description and purchase-policy signals.
- `src/components/shop/item-card.test.tsx`
  Covers the richer quota card body.
- `src/components/shop/item-drawer.tsx`
  Adds clearer fulfillment, limit, and compatibility content for quota products.
- `src/components/shop/item-drawer.test.tsx`
  Verifies the new quota drawer sections.
- `src/app/shop/page-helpers.ts`
  Extends quota product search and sort inputs to include provider/unit metadata.
- `src/app/shop/page.test.tsx`
  Covers quota-product filtering/search behavior at page level.

### New Files To Create

- `src/app/admin/api-quota-product-draft.ts`
  Holds admin quota-product draft defaults, provider presets, purchase-policy helpers, and preview formatting so the panel file stays focused.
- `src/app/admin/api-quota-product-draft.test.ts`
  Covers preset selection, purchase policy conversion, and derived preview labels.

## Task 1: P0 Remove Legacy Inventory Semantics From Admin Quota Products

**Files:**
- Modify: `src/app/api/admin/shop/products/route.ts`
- Modify: `src/app/api/admin/shop/products/route.test.ts`
- Modify: `src/lib/shop-client.ts`
- Modify: `src/lib/shop-client.test.ts`
- Modify: `src/lib/agent-public-documents.ts`

- [ ] **Step 1: Write the failing route test for the cleaned admin product response**

```ts
test("GET /api/admin/shop/products lists api quota products without inventory counts", async () => {
  mockAdminSession();
  let receivedArgs: unknown = null;

  prismaClient.catalogProduct = {
    findMany: async (args: unknown) => {
      receivedArgs = args;
      return [
        createCatalogProductFixture({
          id: "product-1",
          isActive: false,
          _count: {
            purchaseOrders: 5,
          },
        }),
      ];
    },
  };

  prismaClient.secretInventory = {
    groupBy: async () => {
      throw new Error("secret inventory should not be queried");
    },
  };

  const response = await GET(
    createRouteRequest("http://localhost/api/admin/shop/products", {
      headers: { cookie: `evory_user_session=${ADMIN_TOKEN}` },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual((receivedArgs as { include?: unknown }).include, {
    _count: {
      select: {
        purchaseOrders: true,
      },
    },
  });
  assert.equal(json.data[0].orderCount, 5);
  assert.equal("availableInventoryCount" in json.data[0], false);
  assert.equal("soldInventoryCount" in json.data[0], false);
  assert.equal("voidInventoryCount" in json.data[0], false);
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `node --import tsx --test src/app/api/admin/shop/products/route.test.ts`
Expected: FAIL because `GET /api/admin/shop/products` still calls `secretInventory.groupBy` and returns inventory count fields.

- [ ] **Step 3: Remove the inventory aggregation from the route**

```ts
export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const products = await prisma.catalogProduct.findMany({
    where: { productType: "API_QUOTA" },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          purchaseOrders: true,
        },
      },
    },
  });

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: products.map((product) => {
        const { _count, ...rest } = product;
        return {
          ...rest,
          orderCount: _count.purchaseOrders,
        };
      }),
    })
  );
}
```

- [ ] **Step 4: Update the admin client type to drop inventory state**

```ts
export type AdminSecretProduct = AdminSecretProductRecord & {
  orderCount: number;
};
```

- [ ] **Step 5: Add the failing client test for the leaner admin payload**

```ts
test("fetchAdminSecretProducts reads quota products without inventory counters", async () => {
  const products = await fetchAdminSecretProducts(async () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            id: "product-1",
            name: "Provider Quota Pack",
            description: "10k tokens",
            productType: "API_QUOTA",
            price: 300,
            currencyType: "POINTS",
            isActive: true,
            displayConfig: {
              providerLabel: "Provider",
              quotaUnitLabel: "tokens",
            },
            fulfillmentConfig: {
              quotaAmount: 10000,
              allowRepeatPurchase: true,
            },
            orderCount: 3,
            createdAt: "2026-04-10T00:00:00.000Z",
            updatedAt: "2026-04-10T00:00:00.000Z",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(products[0]?.orderCount, 3);
  assert.equal("inventoryCount" in (products[0] ?? {}), false);
});
```

- [ ] **Step 6: Update stale agent API documentation**

```md
## Shop And Equipment Payloads

- GET /api/agent/shop returns `data.cosmetics` for cosmetic items and `data.apiQuotaProducts` for API quota products.
- POST /api/agent/shop/purchase expects JSON with either `itemId: string` for cosmetics or `productId: string` for API quota products.
- API quota products create pending quota orders after purchase; they are not equipable.
- Each `data.apiQuotaProducts[]` entry includes `providerLabel`, `usageInstructions`, `quotaAmount`, `quotaUnitLabel`, `allowRepeatPurchase`, and `perAgentPurchaseLimit`.
```

- [ ] **Step 7: Run the focused tests to verify the contract passes**

Run: `node --import tsx --test src/app/api/admin/shop/products/route.test.ts src/lib/shop-client.test.ts`
Expected: PASS with no references to inventory counters in admin quota product assertions.

- [ ] **Step 8: Commit the cleanup**

```bash
git add src/app/api/admin/shop/products/route.ts src/app/api/admin/shop/products/route.test.ts src/lib/shop-client.ts src/lib/shop-client.test.ts src/lib/agent-public-documents.ts
git commit -m "refactor: remove inventory semantics from quota products"
```

## Task 2: P0 Normalize Quota Product Naming And Operator Copy

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/components/shop/item-card.test.tsx`
- Modify: `src/components/shop/item-drawer.test.tsx`

- [ ] **Step 1: Write the failing copy assertions for quota wording**

```ts
test("ItemDrawer renders quota-order guidance instead of inventory wording", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={secretItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /待管理员确认|pending admin fulfillment/i);
  assert.doesNotMatch(html, /库存|stock|sold out/i);
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `node --import tsx --test src/components/shop/item-card.test.tsx src/components/shop/item-drawer.test.tsx`
Expected: FAIL because the current translations still use secret-product and inventory-era wording.

- [ ] **Step 3: Update the Chinese quota-product copy**

```ts
"shop.emptyDescription":
  "先创建装扮商品或 API 额度商品，再让 Agent 通过接口购买并等待履约。",
"shop.filter.secretProducts": "API 额度",
"shop.secretProducts.readOnlyHint":
  "API 额度商品在公开商店中仅用于浏览与筛选；购买后会创建待履约订单，由管理员后续确认。",
"shop.secret.agentOnlyReadOnly":
  "API 额度商品仅限 Agent 接口购买。本页面只展示商品信息与履约规则。",
"admin.products.orders.subtitle": "查看额度订单、购买方与履约时间。",
"admin.products.keys.subtitle": "维护管理员提供的 API Key，供账号绑定流程复用。",
```

- [ ] **Step 4: Mirror the same wording changes in English**

```ts
"shop.emptyDescription":
  "Create cosmetic items or API quota products first, then let an agent purchase through the API and wait for fulfillment.",
"shop.secretProducts.readOnlyHint":
  "API quota products are browse-only in the storefront. Purchasing creates a pending order that admins fulfill later.",
"shop.secret.agentOnlyReadOnly":
  "API quota products can only be purchased through the agent API. This page shows product details and fulfillment rules only.",
"admin.products.orders.subtitle": "Review quota orders, buyers, and fulfillment timestamps.",
"admin.products.keys.subtitle": "Maintain admin-provided API keys that the account-binding flow can reuse.",
```

- [ ] **Step 5: Tighten the component assertions around the new copy**

```ts
assert.match(html, /待履约订单|pending order/i);
assert.match(html, /履约规则|fulfillment rules/i);
assert.doesNotMatch(html, /库存|stock count/i);
```

- [ ] **Step 6: Run the focused tests to verify the copy is aligned**

Run: `node --import tsx --test src/components/shop/item-card.test.tsx src/components/shop/item-drawer.test.tsx`
Expected: PASS with quota-order language and no inventory-era wording in quota product assertions.

- [ ] **Step 7: Commit the copy normalization**

```bash
git add src/i18n/zh.ts src/i18n/en.ts src/components/shop/item-card.test.tsx src/components/shop/item-drawer.test.tsx
git commit -m "refactor: normalize quota product copy"
```

## Task 3: P1 Rework The Admin Quota Product Creation Surface

**Files:**
- Create: `src/app/admin/api-quota-product-draft.ts`
- Create: `src/app/admin/api-quota-product-draft.test.ts`
- Modify: `src/app/admin/admin-secret-products-panel.tsx`
- Modify: `src/app/admin/admin-secret-products-panel.test.tsx`

- [ ] **Step 1: Write the failing helper tests for presets and purchase policy conversion**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  API_QUOTA_PROVIDER_PRESETS,
  createInitialQuotaProductDraft,
  toPerAgentPurchaseLimit,
  getPurchasePolicyLabel,
} from "./api-quota-product-draft";

test("createInitialQuotaProductDraft starts with the OpenAI tokens preset", () => {
  const draft = createInitialQuotaProductDraft();

  assert.equal(draft.providerPreset, "openai");
  assert.equal(draft.providerLabel, "OpenAI");
  assert.equal(draft.quotaUnitLabel, "tokens");
});

test("toPerAgentPurchaseLimit converts single purchase policy into a one-order limit", () => {
  assert.equal(
    toPerAgentPurchaseLimit({
      purchasePolicy: "single",
      perAgentPurchaseLimit: null,
    }),
    1
  );
});

test("getPurchasePolicyLabel formats limited quota policies", () => {
  const label = getPurchasePolicyLabel({
    purchasePolicy: "limited",
    perAgentPurchaseLimit: 3,
  });

  assert.equal(label, "每个 Agent 最多 3 次");
});
```

- [ ] **Step 2: Run the new helper test to verify it fails**

Run: `node --import tsx --test src/app/admin/api-quota-product-draft.test.ts`
Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Create the helper module for presets, preview, and purchase policy mapping**

```ts
export const API_QUOTA_PROVIDER_PRESETS = {
  openai: { label: "OpenAI", unit: "tokens" },
  anthropic: { label: "Anthropic", unit: "tokens" },
  custom: { label: "", unit: "credits" },
} as const;

export type ProductPurchasePolicy = "repeat" | "single" | "limited";

export type QuotaProductDraft = {
  name: string;
  description: string;
  price: number;
  providerPreset: keyof typeof API_QUOTA_PROVIDER_PRESETS;
  providerLabel: string;
  usageInstructions: string;
  quotaAmount: number;
  quotaUnitLabel: string;
  purchasePolicy: ProductPurchasePolicy;
  perAgentPurchaseLimit: number | null;
};

export function createInitialQuotaProductDraft(): QuotaProductDraft {
  return {
    name: "",
    description: "",
    price: 0,
    providerPreset: "openai",
    providerLabel: API_QUOTA_PROVIDER_PRESETS.openai.label,
    usageInstructions: "",
    quotaAmount: 10000,
    quotaUnitLabel: API_QUOTA_PROVIDER_PRESETS.openai.unit,
    purchasePolicy: "repeat",
    perAgentPurchaseLimit: null,
  };
}

export function toPerAgentPurchaseLimit(input: {
  purchasePolicy: ProductPurchasePolicy;
  perAgentPurchaseLimit: number | null;
}) {
  if (input.purchasePolicy === "single") {
    return 1;
  }
  if (input.purchasePolicy === "limited") {
    return input.perAgentPurchaseLimit;
  }
  return null;
}
```

- [ ] **Step 4: Write the failing panel test for preset controls and preview**

```ts
test("AdminSecretProductsPanel renders quota presets and storefront preview", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[createProduct()]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.form\.providerPreset/);
  assert.match(html, /admin\.products\.form\.purchasePolicy/);
  assert.match(html, /admin\.products\.preview\.title/);
});
```

- [ ] **Step 5: Run the admin panel test to verify it fails**

Run: `node --import tsx --test src/app/admin/admin-secret-products-panel.test.tsx`
Expected: FAIL because the panel does not render provider presets, purchase policy controls, or a storefront preview section.

- [ ] **Step 6: Refactor the panel to consume the helper and simplify the form**

```ts
import {
  API_QUOTA_PROVIDER_PRESETS,
  createInitialQuotaProductDraft,
  createQuotaProductDraftFromProduct,
  getPurchasePolicyLabel,
  toPerAgentPurchaseLimit,
  type QuotaProductDraft,
} from "./api-quota-product-draft";

const limitValue = toPerAgentPurchaseLimit({
  purchasePolicy: productDraft.purchasePolicy,
  perAgentPurchaseLimit: productDraft.perAgentPurchaseLimit,
});

<label className="space-y-2">
  <span className="text-xs font-semibold text-muted">
    {t("admin.products.form.providerPreset")}
  </span>
  <select
    value={productDraft.providerPreset}
    onChange={(event) =>
      setProductDraft((current) => {
        const preset = event.target.value as keyof typeof API_QUOTA_PROVIDER_PRESETS;
        const nextPreset = API_QUOTA_PROVIDER_PRESETS[preset];
        return {
          ...current,
          providerPreset: preset,
          providerLabel: nextPreset.label || current.providerLabel,
          quotaUnitLabel: nextPreset.unit,
        };
      })
    }
  >
    <option value="openai">OpenAI</option>
    <option value="anthropic">Anthropic</option>
    <option value="custom">{t("admin.products.form.providerPresetCustom")}</option>
  </select>
</label>

<label className="space-y-2 md:col-span-2">
  <span className="text-xs font-semibold text-muted">
    {t("admin.products.form.purchasePolicy")}
  </span>
  <select
    value={productDraft.purchasePolicy}
    onChange={(event) =>
      setProductDraft((current) => ({
        ...current,
        purchasePolicy: event.target.value as QuotaProductDraft["purchasePolicy"],
        perAgentPurchaseLimit:
          event.target.value === "limited" ? current.perAgentPurchaseLimit ?? 2 : null,
      }))
    }
  >
    <option value="repeat">{t("admin.products.form.purchasePolicyRepeat")}</option>
    <option value="single">{t("admin.products.form.purchasePolicySingle")}</option>
    <option value="limited">{t("admin.products.form.purchasePolicyLimited")}</option>
  </select>
</label>
```

- [ ] **Step 7: Add the inline storefront preview and operator summary row**

```tsx
<Card className="border-card-border/40 bg-background/20">
  <div className="space-y-2">
    <h3 className="text-sm font-semibold text-foreground">
      {t("admin.products.preview.title")}
    </h3>
    <p className="text-sm text-muted">{t("admin.products.preview.subtitle")}</p>
  </div>
  <div className="mt-4 rounded-2xl border border-card-border/40 bg-card/70 px-4 py-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
      {productDraft.providerLabel || t("admin.products.providerLabelEmpty")}
    </div>
    <div className="mt-2 text-base font-semibold text-foreground">
      {productDraft.name || t("admin.products.preview.nameFallback")}
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <Badge variant="secondary">
        {`${productDraft.quotaAmount} ${productDraft.quotaUnitLabel}`}
      </Badge>
      <Badge variant="outline">
        {getPurchasePolicyLabel(productDraft)}
      </Badge>
      <Badge variant="outline">{`${productDraft.price} ${t("common.pts")}`}</Badge>
    </div>
  </div>
</Card>
```

- [ ] **Step 8: Update form submission to derive limit and repeat settings from the new policy**

```ts
const perAgentPurchaseLimit = toPerAgentPurchaseLimit({
  purchasePolicy: productDraft.purchasePolicy,
  perAgentPurchaseLimit: productDraft.perAgentPurchaseLimit,
});

const allowRepeatPurchase = productDraft.purchasePolicy !== "single";
```

- [ ] **Step 9: Run the helper and panel tests to verify the new flow passes**

Run: `node --import tsx --test src/app/admin/api-quota-product-draft.test.ts src/app/admin/admin-secret-products-panel.test.tsx`
Expected: PASS with preset controls, purchase policy mapping, and preview content rendered.

- [ ] **Step 10: Commit the admin creation improvements**

```bash
git add src/app/admin/api-quota-product-draft.ts src/app/admin/api-quota-product-draft.test.ts src/app/admin/admin-secret-products-panel.tsx src/app/admin/admin-secret-products-panel.test.tsx
git commit -m "feat: improve admin quota product creation flow"
```

## Task 4: P2 Improve Storefront Quota Product Discovery And Detail Content

**Files:**
- Modify: `src/components/shop/item-card.tsx`
- Modify: `src/components/shop/item-card.test.tsx`
- Modify: `src/components/shop/item-drawer.tsx`
- Modify: `src/components/shop/item-drawer.test.tsx`
- Modify: `src/app/shop/page-helpers.ts`
- Modify: `src/app/shop/page.test.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Write the failing quota-card test for richer compact content**

```ts
test("ItemCard renders quota description and purchase limit summary", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /API quota/);
  assert.match(html, /单次购买|Single purchase/);
});
```

- [ ] **Step 2: Write the failing drawer test for fulfillment detail blocks**

```ts
test("ItemDrawer renders fulfillment timing and per-agent purchase policy", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={secretItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /待管理员确认|pending admin fulfillment/i);
  assert.match(html, /每个 Agent 最多 1 次|1 purchase per agent/i);
});
```

- [ ] **Step 3: Run the component tests to verify they fail**

Run: `node --import tsx --test src/components/shop/item-card.test.tsx src/components/shop/item-drawer.test.tsx`
Expected: FAIL because the compact card omits quota description and the drawer does not show fulfillment timing or limit summaries.

- [ ] **Step 4: Expand the quota card with description and policy summaries**

```tsx
<div className="space-y-3">
  <div className="space-y-2">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
      {providerLabel}
    </p>
    <h3 className="text-base font-semibold text-foreground truncate">{item.name}</h3>
    <p className="text-sm text-muted line-clamp-2 leading-relaxed">
      {item.description}
    </p>
  </div>

  <div className="flex flex-wrap items-center gap-2">
    <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
      {quotaLabel}
    </span>
    <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
      {item.detail.perAgentPurchaseLimit
        ? t("shop.secret.limitValue", { count: item.detail.perAgentPurchaseLimit })
        : t("shop.secret.limitUnlimited")}
    </span>
  </div>
</div>
```

- [ ] **Step 5: Expand the quota drawer with fulfillment and compatibility sections**

```tsx
<div className="grid grid-cols-2 gap-4">
  <div className="rounded-xl border border-card-border/30 bg-card/40 p-3 space-y-1">
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
      {t("shop.secret.fulfillmentTitle")}
    </p>
    <p className="text-sm font-medium text-foreground">
      {t("shop.secret.fulfillmentPending")}
    </p>
  </div>
  <div className="rounded-xl border border-card-border/30 bg-card/40 p-3 space-y-1">
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
      {t("shop.secret.purchasePolicy")}
    </p>
    <p className="text-sm font-medium text-foreground">
      {item.detail.perAgentPurchaseLimit
        ? t("shop.secret.limitValue", { count: item.detail.perAgentPurchaseLimit })
        : t("shop.secret.limitUnlimited")}
    </p>
  </div>
</div>
```

- [ ] **Step 6: Extend quota-product search to include provider and quota unit**

```ts
if (q) {
  result = result.filter((entry) => {
    const name = safeText(entry.name).toLowerCase();
    const description = safeText(entry.description).toLowerCase();
    const provider =
      entry.entryType === "api_quota_product"
        ? safeText(entry.providerLabel).toLowerCase()
        : "";
    const quotaUnit =
      entry.entryType === "api_quota_product"
        ? safeText(entry.quotaUnitLabel).toLowerCase()
        : "";

    return (
      name.includes(q) ||
      description.includes(q) ||
      provider.includes(q) ||
      quotaUnit.includes(q)
    );
  });
}
```

- [ ] **Step 7: Add the page-level search regression test**

```ts
test("filterAndSortCatalogEntries matches quota products by provider label", () => {
  const result = filterAndSortCatalogEntries({
    catalog: [
      {
        entryType: "api_quota_product",
        id: "product-1",
        name: "Starter Pack",
        description: "10k tokens",
        price: 300,
        currencyType: "POINTS",
        providerLabel: "OpenAI",
        usageInstructions: null,
        quotaAmount: 10000,
        quotaUnitLabel: "tokens",
        allowRepeatPurchase: true,
        perAgentPurchaseLimit: null,
      },
    ],
    activeTab: "secretProducts",
    search: "openai",
    sort: "price-asc",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, "Starter Pack");
});
```

- [ ] **Step 8: Add the new storefront translation keys**

```ts
"shop.secret.fulfillmentTitle": "履约方式",
"shop.secret.fulfillmentPending": "购买后生成待履约订单",
"shop.secret.purchasePolicy": "购买规则",
"shop.secret.limitUnlimited": "不限制购买次数",
"shop.secret.limitValue": "每个 Agent 最多 {count} 次",
```

- [ ] **Step 9: Run the storefront tests to verify the richer quota experience**

Run: `node --import tsx --test src/components/shop/item-card.test.tsx src/components/shop/item-drawer.test.tsx src/app/shop/page.test.tsx`
Expected: PASS with description-rich quota cards, fulfillment detail in the drawer, and provider-aware search.

- [ ] **Step 10: Commit the storefront improvements**

```bash
git add src/components/shop/item-card.tsx src/components/shop/item-card.test.tsx src/components/shop/item-drawer.tsx src/components/shop/item-drawer.test.tsx src/app/shop/page-helpers.ts src/app/shop/page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: improve quota product storefront discovery"
```

## Self-Review

- Spec coverage:
  Task 1 covers the highest-priority contract cleanup so admin quota products stop pretending to be inventory-backed.
  Task 2 covers the remaining naming and copy mismatch that still teaches the old business model.
  Task 3 covers admin-side creation efficiency through presets, policy controls, and preview.
  Task 4 covers storefront presentation, fulfillment clarity, and quota-specific search.
- Placeholder scan:
  No `TODO`, `TBD`, or “similar to” instructions remain. Every task has concrete files, code snippets, commands, and expected outcomes.
- Type consistency:
  The plan consistently uses `API_QUOTA`, `apiQuotaProducts`, `orderCount`, `quotaAmount`, `quotaUnitLabel`, `purchasePolicy`, and `perAgentPurchaseLimit`.

## Priority Summary

1. P0: Remove legacy inventory semantics from admin quota products.
2. P0: Normalize quota product naming and operator copy.
3. P1: Rework the admin quota product creation surface.
4. P2: Improve storefront quota product discovery and detail content.
