# Shop Phase 2 Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose secret credential products in the public `/shop` page as read-only catalog entries mixed with existing cosmetics.

**Architecture:** Extend the existing public shop API into a unified mixed-catalog response and propagate that explicit contract through the shop client and storefront UI. Keep one shared grid and drawer surface, but branch card and drawer rendering by `entryType` so cosmetics keep their current presentation while secret products render as information-first entries.

**Tech Stack:** Next.js App Router, React client components, TypeScript discriminated unions, Prisma, Node test runner, existing i18n dictionaries

---

## File Structure

- Modify: `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.ts`
  Public mixed-catalog API for cosmetics and secret products.
- Modify: `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.test.ts`
  API coverage for active-item filtering and secret-product stock fields.
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.ts`
  Shared public shop catalog types and fetch helpers.
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.test.ts`
  Client parsing coverage for unified mixed-catalog responses.
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/utils.ts`
  Replace cosmetic-only storefront model with a discriminated union plus helpers.
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/category-tabs.tsx`
  Replace category-first tabs with type-filter tabs.
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-card.tsx`
  Render type-aware cosmetic vs secret-product cards.
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-card.test.tsx`
  Card coverage for both product families.
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-drawer.tsx`
  Render type-aware drawer content with secret-product rules and warnings.
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-drawer.test.tsx`
  Drawer coverage for both product families.
- Modify: `/Volumes/T7/Code/Evory/src/app/shop/page.tsx`
  Unified mixed-catalog page state, filtering, sorting, and empty states.
- Modify: `/Volumes/T7/Code/Evory/src/app/shop/page.test.tsx`
  Page-level storefront shell coverage.
- Modify: `/Volumes/T7/Code/Evory/src/i18n/en.ts`
  English copy for mixed storefront filters and secret-product messaging.
- Modify: `/Volumes/T7/Code/Evory/src/i18n/zh.ts`
  Chinese copy for mixed storefront filters and secret-product messaging.

### Task 1: Build The Unified Public Catalog API

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.test.ts`

- [ ] **Step 1: Write the failing API tests for the mixed catalog**

Add assertions to `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.test.ts` for:

```ts
test("GET /api/points/shop returns mixed cosmetic and secret-product entries", async () => {
  // mock one active shopItem and one active secret product with available stock
  // assert response.data contains both entryType: "cosmetic" and "secret_product"
});

test("GET /api/points/shop derives secret-product stock from AVAILABLE rows only", async () => {
  // mock availableInventoryCount = 2 while sold/void rows also exist
  // assert detail.availableInventoryCount === 2 and detail.isInStock === true
});
```

- [ ] **Step 2: Run the API test file to confirm the new cases fail**

Run: `node --import tsx --test src/app/api/points/shop/route.test.ts`

Expected: FAIL because the route only reads `shopItem` rows and does not emit unified entries.

- [ ] **Step 3: Implement the mixed-catalog route**

Update `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.ts` so it loads active cosmetics and active secret products, then returns one unified list:

```ts
const [items, products] = await Promise.all([
  prisma.shopItem.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  }),
  prisma.catalogProduct.findMany({
    where: {
      isActive: true,
      productType: "SECRET_CREDENTIAL",
    },
    orderBy: [{ name: "asc" }],
    include: {
      _count: {
        select: {
          secretInventory: {
            where: { status: "AVAILABLE" },
          },
        },
      },
    },
  }),
]);

const data = [
  ...items.map((item) => ({
    id: item.id,
    entryType: "cosmetic" as const,
    name: item.name,
    description: item.description,
    price: item.price,
    currencyType: item.currencyType,
    badges: ["cosmetic"],
    detail: {
      category: item.category,
      type: item.type,
      spriteKey: item.spriteKey,
    },
  })),
  ...products.map((product) => ({
    id: product.id,
    entryType: "secret_product" as const,
    name: product.name,
    description: product.description,
    price: product.price,
    currencyType: product.currencyType,
    badges: [
      "secret_product",
      product._count.secretInventory > 0 ? "in_stock" : "sold_out",
      "one_time_visible",
    ],
    detail: {
      providerLabel: typeof product.displayConfig === "object"
        ? (product.displayConfig as { providerLabel?: string | null }).providerLabel ?? null
        : null,
      usageInstructions: typeof product.displayConfig === "object"
        ? (product.displayConfig as { usageInstructions?: string | null }).usageInstructions ?? null
        : null,
      isInStock: product._count.secretInventory > 0,
      availableInventoryCount: product._count.secretInventory,
      allowRepeatPurchase: typeof product.fulfillmentConfig === "object"
        ? (product.fulfillmentConfig as { allowRepeatPurchase?: boolean }).allowRepeatPurchase ?? true
        : true,
      perAgentPurchaseLimit: typeof product.fulfillmentConfig === "object"
        ? (product.fulfillmentConfig as { perAgentPurchaseLimit?: number | null }).perAgentPurchaseLimit ?? null
        : null,
    },
  })),
];
```

- [ ] **Step 4: Run the API tests and confirm they pass**

Run: `node --import tsx --test src/app/api/points/shop/route.test.ts`

Expected: PASS, including the new mixed-catalog and AVAILABLE-only stock assertions.

- [ ] **Step 5: Commit the API contract change**

```bash
git add src/app/api/points/shop/route.ts src/app/api/points/shop/route.test.ts
git commit -m "Add mixed public shop catalog"
```

### Task 2: Upgrade Shared Storefront Types And Client Parsing

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.ts`
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/utils.ts`
- Test: `/Volumes/T7/Code/Evory/src/lib/shop-client.test.ts`

- [ ] **Step 1: Write failing client tests for explicit mixed-catalog parsing**

Add tests in `/Volumes/T7/Code/Evory/src/lib/shop-client.test.ts` for:

```ts
test("fetchShopItems reads unified public catalog entries", async () => {
  // mock one cosmetic and one secret_product entry
  // assert returned array preserves both entryType values
});

test("shop client helpers expose secret-product detail fields", async () => {
  // assert providerLabel, isInStock, usageInstructions, and perAgentPurchaseLimit survive parsing
});
```

- [ ] **Step 2: Run the client tests to verify failure**

Run: `node --import tsx --test src/lib/shop-client.test.ts`

Expected: FAIL because `fetchShopItems` still returns `Array<Record<string, unknown>>`.

- [ ] **Step 3: Replace storefront `Record<string, unknown>` types with an explicit union**

Update `/Volumes/T7/Code/Evory/src/lib/shop-client.ts` and `/Volumes/T7/Code/Evory/src/components/shop/utils.ts`:

```ts
export type PublicShopCatalogEntry =
  | {
      id: string;
      entryType: "cosmetic";
      name: string;
      description: string;
      price: number;
      currencyType: "POINTS";
      badges: string[];
      detail: {
        category: string;
        type: string;
        spriteKey: string;
      };
    }
  | {
      id: string;
      entryType: "secret_product";
      name: string;
      description: string;
      price: number;
      currencyType: "POINTS";
      badges: string[];
      detail: {
        providerLabel: string | null;
        usageInstructions: string | null;
        isInStock: boolean;
        availableInventoryCount: number;
        allowRepeatPurchase: boolean;
        perAgentPurchaseLimit: number | null;
      };
    };

export async function fetchShopItems(fetcher: PublicFetch = fetch) {
  const response = await fetcher("/api/points/shop");
  return readEnvelope<PublicShopCatalogEntry[]>(response);
}
```

Also add small helpers in `utils.ts`:

```ts
export function isCosmeticEntry(
  entry: PublicShopCatalogEntry
): entry is Extract<PublicShopCatalogEntry, { entryType: "cosmetic" }> {
  return entry.entryType === "cosmetic";
}

export function isSecretProductEntry(
  entry: PublicShopCatalogEntry
): entry is Extract<PublicShopCatalogEntry, { entryType: "secret_product" }> {
  return entry.entryType === "secret_product";
}
```

- [ ] **Step 4: Run the client tests and confirm the explicit union passes**

Run: `node --import tsx --test src/lib/shop-client.test.ts`

Expected: PASS, with no fallback casts to `unknown` or `Record<string, unknown>` in storefront reads.

- [ ] **Step 5: Commit the shared-type refactor**

```bash
git add src/lib/shop-client.ts src/lib/shop-client.test.ts src/components/shop/utils.ts
git commit -m "Type the public shop mixed catalog"
```

### Task 3: Rebuild The Storefront Page Around Product-Type Filtering

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/shop/page.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/category-tabs.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/app/shop/page.test.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/i18n/en.ts`
- Modify: `/Volumes/T7/Code/Evory/src/i18n/zh.ts`

- [ ] **Step 1: Add failing page tests for mixed storefront shell behavior**

Add tests in `/Volumes/T7/Code/Evory/src/app/shop/page.test.tsx` for:

```ts
test("shop page renders mixed-catalog type filters", () => {
  // assert All / Cosmetics / Secret Products filter labels render
});

test("shop page keeps secret-product storefront read-only copy", () => {
  // assert no secret-product purchase CTA text appears
});
```

- [ ] **Step 2: Run the page tests to confirm failure**

Run: `node --import tsx --test src/app/shop/page.test.tsx`

Expected: FAIL because the current tabs still render cosmetic categories only.

- [ ] **Step 3: Replace category-first page state with product-type filtering**

Update `/Volumes/T7/Code/Evory/src/components/shop/category-tabs.tsx`:

```ts
const TAB_OPTIONS = [
  { key: "all", labelKey: "shop.filter.all" as TranslationKey },
  { key: "cosmetic", labelKey: "shop.filter.cosmetics" as TranslationKey },
  { key: "secret_product", labelKey: "shop.filter.secretProducts" as TranslationKey },
] as const;
```

Update `/Volumes/T7/Code/Evory/src/app/shop/page.tsx`:

```ts
const [items, setItems] = useState<PublicShopCatalogEntry[]>([]);
const [activeTab, setActiveTab] =
  useState<"all" | "cosmetic" | "secret_product">("all");

const filteredItems = useMemo(() => {
  let result = items;
  if (activeTab !== "all") {
    result = result.filter((item) => item.entryType === activeTab);
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  }
  return sortItems(result, sort);
}, [items, activeTab, search, sort]);

const categoryCounts = useMemo(() => ({
  all: items.length,
  cosmetic: items.filter((item) => item.entryType === "cosmetic").length,
  secret_product: items.filter((item) => item.entryType === "secret_product").length,
}), [items]);
```

Update empty-state and helper copy in `/Volumes/T7/Code/Evory/src/i18n/en.ts` and `/Volumes/T7/Code/Evory/src/i18n/zh.ts` with:

```ts
"shop.filter.cosmetics": "Cosmetics",
"shop.filter.secretProducts": "Secret Products",
"shop.empty": "No products are available in the shop right now.",
"shop.emptyDescription": "The public storefront currently shows both cosmetic items and secret credential listings.",
```

- [ ] **Step 4: Run the page tests and confirm the new shell passes**

Run: `node --import tsx --test src/app/shop/page.test.tsx`

Expected: PASS with the new primary filters and mixed-catalog copy.

- [ ] **Step 5: Commit the storefront shell refactor**

```bash
git add src/app/shop/page.tsx src/app/shop/page.test.tsx src/components/shop/category-tabs.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "Refactor shop page for mixed catalog filters"
```

### Task 4: Render Type-Aware Cards And Drawer Content

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-card.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-card.test.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-drawer.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/item-drawer.test.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/i18n/en.ts`
- Modify: `/Volumes/T7/Code/Evory/src/i18n/zh.ts`

- [ ] **Step 1: Write failing component tests for secret-product card and drawer variants**

Add tests:

```ts
test("ItemCard renders provider and stock state for secret products", () => {
  // assert provider label, stock badge, and one-time-visible copy render
});

test("ItemCard does not render lobster preview for secret products", () => {
  // assert no canvas is present for entryType === "secret_product"
});

test("ItemDrawer renders secret-product usage instructions and delivery warning", () => {
  // assert one-time secret warning and usageInstructions render
});
```

- [ ] **Step 2: Run the card and drawer tests to confirm failure**

Run:

```bash
node --import tsx --test src/components/shop/item-card.test.tsx
node --import tsx --test src/components/shop/item-drawer.test.tsx
```

Expected: FAIL because both components currently assume cosmetics only.

- [ ] **Step 3: Implement type-aware card and drawer rendering**

Update `/Volumes/T7/Code/Evory/src/components/shop/item-card.tsx`:

```tsx
if (item.entryType === "secret_product") {
  return (
    <button onClick={() => onClick(item)} className="...">
      <div className="px-5 pt-5 pb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
              {item.detail.providerLabel ?? t("shop.secret.providerFallback")}
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{item.name}</h3>
          </div>
          <span className="rounded-md border ...">
            {item.detail.isInStock ? t("shop.secret.inStock") : t("shop.secret.soldOut")}
          </span>
        </div>
        <p className="text-sm text-muted line-clamp-2">{item.description}</p>
        <div className="flex items-center justify-between">
          <span className="rounded-md border ...">{t("shop.secret.oneTimeVisible")}</span>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-warning font-display">{item.price}</span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted">pts</span>
          </div>
        </div>
      </div>
    </button>
  );
}
```

Update `/Volumes/T7/Code/Evory/src/components/shop/item-drawer.tsx`:

```tsx
if (item.entryType === "secret_product") {
  return (
    <div className="...">
      <h2 className="font-display text-2xl font-bold text-foreground">{item.name}</h2>
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        {item.detail.providerLabel ?? t("shop.secret.providerFallback")}
      </p>
      <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
        <p className="text-xs text-muted">{t("shop.secret.agentOnlyReadOnly")}</p>
      </div>
      <div className="rounded-xl border border-warning/20 bg-warning/5 px-4 py-3">
        <p className="text-xs text-foreground/80">{t("shop.secret.oneTimeDrawerWarning")}</p>
      </div>
      {item.detail.usageInstructions ? (
        <section className="space-y-1.5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-muted">
            {t("shop.secret.usageInstructions")}
          </h3>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {item.detail.usageInstructions}
          </p>
        </section>
      ) : null}
    </div>
  );
}
```

Add translation keys in both locale files for:

```ts
"shop.secret.providerFallback"
"shop.secret.inStock"
"shop.secret.soldOut"
"shop.secret.oneTimeVisible"
"shop.secret.agentOnlyReadOnly"
"shop.secret.oneTimeDrawerWarning"
"shop.secret.usageInstructions"
```

- [ ] **Step 4: Run the component tests and confirm both product families render correctly**

Run:

```bash
node --import tsx --test src/components/shop/item-card.test.tsx
node --import tsx --test src/components/shop/item-drawer.test.tsx
```

Expected: PASS with secret-product variants and no cosmetic preview leakage.

- [ ] **Step 5: Run merged storefront verification**

Run:

```bash
node --import tsx --test src/app/api/points/shop/route.test.ts
node --import tsx --test src/lib/shop-client.test.ts
node --import tsx --test src/app/shop/page.test.tsx
node --import tsx --test src/components/shop/item-card.test.tsx
node --import tsx --test src/components/shop/item-drawer.test.tsx
npm run build
npm test
```

Expected:

- targeted test files PASS
- `npm run build` PASS
- `npm test` PASS with no new storefront regressions

- [ ] **Step 6: Commit the storefront rendering changes**

```bash
git add src/components/shop/item-card.tsx src/components/shop/item-card.test.tsx src/components/shop/item-drawer.tsx src/components/shop/item-drawer.test.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "Render secret products in public storefront"
```
