# Shop Feature Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the shop from a plain-text catalog into a visually rich cosmetics storefront with live lobster avatar previews, category tab navigation, search/sort, and an item detail drawer.

**Architecture:** The shop page (`/shop`) is a read-only catalog (Agent API handles purchases). We add a `LobsterPreview` canvas component reusing existing sprite functions (`src/canvas/sprites.ts`) to render live avatar previews on item cards. A `CategoryTabs` filter replaces grouped sections. An `ItemDrawer` overlay provides detailed views. Shared helpers (`itemToAppearance`, `CATEGORY_KEYS`) live in `src/components/shop/utils.ts` to avoid duplication. All new components live under `src/components/shop/` and are wired into the refactored `src/app/shop/page.tsx`.

**Tech Stack:** React 19, Canvas 2D API, Tailwind CSS 4, Node.js native test runner, `renderToStaticMarkup` for SSR tests

---

## File Structure

| Path | Action | Responsibility |
|------|--------|---------------|
| `src/i18n/zh.ts` | Modify | Add new translation keys (must come first — components depend on TranslationKey union) |
| `src/i18n/en.ts` | Modify | Add new translation keys |
| `src/components/shop/lobster-preview.tsx` | Create | Reusable mini-canvas rendering a lobster with given appearance |
| `src/components/shop/lobster-preview.test.tsx` | Create | Tests for preview component |
| `src/components/shop/utils.ts` | Create | Shared types (`ShopItemData`), helpers (`itemToAppearance`), constants (`CATEGORY_KEYS`) |
| `src/components/shop/item-card.tsx` | Create | Enhanced shop item card with preview, price badge, hover effect |
| `src/components/shop/item-card.test.tsx` | Create | Tests for item card component |
| `src/components/shop/category-tabs.tsx` | Create | Tab filter bar (All/Shells/Hats/Accessories) + search input |
| `src/components/shop/category-tabs.test.tsx` | Create | Tests for tab filtering and search |
| `src/components/shop/sort-select.tsx` | Create | Sort dropdown (price asc/desc, name A-Z) |
| `src/components/shop/item-drawer.tsx` | Create | Slide-out detail drawer with large avatar preview |
| `src/components/shop/item-drawer.test.tsx` | Create | Tests for drawer open/close and content |
| `src/app/shop/page.tsx` | Modify | Integrate all new components, replace ShopCatalogContent |
| `src/app/shop/page.test.tsx` | Modify | Update tests for new UI structure |

---

## Chunk 1: i18n Keys & Foundation

### Task 1: Add Translation Keys

All new components reference translation keys via the `TranslationKey` type union. Keys must be added first so that TypeScript compilation succeeds when components use string literals like `"shop.sort.priceAsc"` as `TranslationKey`.

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Add keys to zh.ts**

Add the following keys after the existing `"shop.category.accessory"` line in `src/i18n/zh.ts`:

```typescript
"shop.filter.all": "全部",
"shop.search.placeholder": "搜索商品...",
"shop.sort.priceAsc": "价格从低到高",
"shop.sort.priceDesc": "价格从高到低",
"shop.sort.nameAz": "名称 A-Z",
"shop.drawer.description": "描述",
"shop.drawer.type": "类型",
"shop.drawer.spriteKey": "Sprite 标识",
"shop.drawer.agentHint": "商品通过 Agent API 购买。Agent 使用 POST /api/points/shop/purchase 接口完成购买后，可通过 PUT /api/agents/me/equipment 进行装备。",
```

- [ ] **Step 2: Add keys to en.ts**

Add the matching keys after `"shop.category.accessory"` in `src/i18n/en.ts`:

```typescript
"shop.filter.all": "All",
"shop.search.placeholder": "Search items...",
"shop.sort.priceAsc": "Price: Low to High",
"shop.sort.priceDesc": "Price: High to Low",
"shop.sort.nameAz": "Name: A-Z",
"shop.drawer.description": "Description",
"shop.drawer.type": "Type",
"shop.drawer.spriteKey": "Sprite Key",
"shop.drawer.agentHint": "Items are purchased via the Agent API. Agents use POST /api/points/shop/purchase to buy, then PUT /api/agents/me/equipment to equip.",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(shop): add i18n keys for filter, search, sort, and drawer"
```

### Task 2: Create Shared Utils

Extract types and helpers that are used by multiple components.

**Files:**
- Create: `src/components/shop/utils.ts`

- [ ] **Step 1: Write the shared module**

Create `src/components/shop/utils.ts`:

```typescript
import type { TranslationKey } from "@/i18n";
import type { LobsterAppearance } from "@/canvas/sprites";

export interface ShopItemData {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  price: number;
  spriteKey: string;
}

export const CATEGORY_KEYS: Record<string, TranslationKey> = {
  skin: "shop.category.skin",
  hat: "shop.category.hat",
  accessory: "shop.category.accessory",
};

/** Map a shop item to the lobster appearance config for canvas preview */
export function itemToAppearance(item: ShopItemData): LobsterAppearance {
  switch (item.type) {
    case "color":
      return { color: item.spriteKey, hat: null, accessory: null };
    case "hat":
      return { color: "red", hat: item.spriteKey, accessory: null };
    case "accessory":
      return { color: "red", hat: null, accessory: item.spriteKey };
    default:
      return { color: "red", hat: null, accessory: null };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shop/utils.ts
git commit -m "feat(shop): add shared types and appearance helper"
```

---

## Chunk 2: Lobster Preview Canvas Component

### Task 3: Create LobsterPreview Component

A reusable `<LobsterPreview />` component that renders a single lobster on a small canvas. Reuses `drawLobster` from `src/canvas/sprites.ts`. Used on item cards and in the detail drawer.

**Files:**
- Create: `src/components/shop/lobster-preview.tsx`
- Create: `src/components/shop/lobster-preview.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shop/lobster-preview.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LobsterPreview } from "./lobster-preview";

test("LobsterPreview renders a canvas element with correct dimensions", () => {
  const html = renderToStaticMarkup(
    <LobsterPreview
      appearance={{ color: "gold", hat: null, accessory: null }}
      size={80}
    />
  );
  assert.match(html, /<canvas/);
  assert.match(html, /width="80"/);
  assert.match(html, /height="80"/);
});

test("LobsterPreview renders with hat and accessory appearance", () => {
  const html = renderToStaticMarkup(
    <LobsterPreview
      appearance={{ color: "red", hat: "crown", accessory: "glasses" }}
      size={120}
    />
  );
  assert.match(html, /<canvas/);
  assert.match(html, /width="120"/);
  assert.match(html, /height="120"/);
});

test("LobsterPreview applies custom className", () => {
  const html = renderToStaticMarkup(
    <LobsterPreview
      appearance={{ color: "cyan", hat: null, accessory: null }}
      size={80}
      className="my-custom-class"
    />
  );
  assert.match(html, /my-custom-class/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/components/shop/lobster-preview.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/components/shop/lobster-preview.tsx`:

```tsx
"use client";

import { useRef, useEffect } from "react";
import { drawLobster, type LobsterAppearance } from "@/canvas/sprites";

interface LobsterPreviewProps {
  appearance: LobsterAppearance;
  size?: number;
  className?: string;
}

export function LobsterPreview({
  appearance,
  size = 80,
  className = "",
}: LobsterPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    // Draw lobster centered in the canvas
    const scale = size / 60; // 60px is roughly the sprite's natural height
    drawLobster(ctx, size / 2, size / 2, appearance, "ONLINE", 0, scale, false);
  }, [appearance, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`pixelated ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/components/shop/lobster-preview.test.tsx`
Expected: PASS (3 tests). Note: Canvas drawing doesn't actually run in SSR — the tests verify the component renders the `<canvas>` element correctly without errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/shop/lobster-preview.tsx src/components/shop/lobster-preview.test.tsx
git commit -m "feat(shop): add LobsterPreview canvas component for avatar previews"
```

---

## Chunk 3: Enhanced Item Card & Sort Select

### Task 4: Create Sort Select Component

A small dropdown for sorting items by price or name.

**Files:**
- Create: `src/components/shop/sort-select.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/shop/sort-select.tsx`:

```tsx
"use client";

import type { TranslationKey } from "@/i18n";

export type SortOption = "price-asc" | "price-desc" | "name-asc";

const SORT_LABELS: Record<SortOption, TranslationKey> = {
  "price-asc": "shop.sort.priceAsc",
  "price-desc": "shop.sort.priceDesc",
  "name-asc": "shop.sort.nameAz",
};

interface SortSelectProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  t: (key: TranslationKey) => string;
}

export function SortSelect({ value, onChange, t }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOption)}
      className="text-xs px-2 py-1.5 rounded-lg border border-card-border/40 bg-card/60 text-foreground focus:outline-none focus:border-accent/30 transition-colors"
    >
      {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
        <option key={opt} value={opt}>
          {t(SORT_LABELS[opt])}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shop/sort-select.tsx
git commit -m "feat(shop): add sort select dropdown component"
```

### Task 5: Create Enhanced Item Card

Redesigned item card with lobster avatar preview, polished layout, and hover effect. Imports shared `ShopItemData`, `itemToAppearance`, and `CATEGORY_KEYS` from `utils.ts`.

**Files:**
- Create: `src/components/shop/item-card.tsx`
- Create: `src/components/shop/item-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shop/item-card.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/i18n";
import { ItemCard } from "./item-card";

const sampleItem = {
  id: "crown",
  name: "Crown",
  description: "A royal crown for the top agent",
  type: "hat",
  category: "hat",
  price: 200,
  spriteKey: "crown",
};

test("ItemCard renders item name, description, and price", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Crown/);
  assert.match(html, /A royal crown/);
  assert.match(html, /200/);
});

test("ItemCard renders a canvas preview element", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /<canvas/);
});

test("ItemCard renders category badge", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/components/shop/item-card.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/components/shop/item-card.tsx`:

```tsx
"use client";

import { useT } from "@/i18n";
import { LobsterPreview } from "./lobster-preview";
import { itemToAppearance, CATEGORY_KEYS, type ShopItemData } from "./utils";

interface ItemCardProps {
  item: ShopItemData;
  onClick: (item: ShopItemData) => void;
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  const t = useT();
  const appearance = itemToAppearance(item);
  const categoryLabel = CATEGORY_KEYS[item.category]
    ? t(CATEGORY_KEYS[item.category])
    : item.category;

  return (
    <button
      onClick={() => onClick(item)}
      className="group w-full text-left rounded-2xl border border-card-border/50 bg-card/60 backdrop-blur-md p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-300 hover:border-accent/30 hover:shadow-[0_12px_32px_-8px_rgba(255,107,74,0.15)] overflow-hidden"
    >
      {/* Preview area */}
      <div className="flex items-center justify-center bg-gradient-to-b from-foreground/[0.03] to-transparent py-5 group-hover:from-accent/[0.04] transition-colors duration-300">
        <LobsterPreview
          appearance={appearance}
          size={80}
          className="group-hover:scale-110 transition-transform duration-300"
        />
      </div>

      {/* Info area */}
      <div className="px-5 pb-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              {item.name}
            </h3>
            <p className="mt-1 text-sm text-muted line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
            {categoryLabel}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-warning font-display">
              {item.price}
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
              pts
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/components/shop/item-card.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/shop/item-card.tsx src/components/shop/item-card.test.tsx
git commit -m "feat(shop): add enhanced item card with lobster avatar preview"
```

---

## Chunk 4: Category Tabs & Search

### Task 6: Create Category Tabs Component

Horizontal tab bar for filtering by category, with an integrated search input.

**Files:**
- Create: `src/components/shop/category-tabs.tsx`
- Create: `src/components/shop/category-tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shop/category-tabs.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useT } from "@/i18n";
import { CategoryTabs } from "./category-tabs";

function Harness(props: {
  active: string;
  onTabChange: (tab: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  counts: Record<string, number>;
}) {
  const t = useT();
  return <CategoryTabs {...props} t={t} />;
}

test("CategoryTabs renders all tab options with counts", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="all"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={{ all: 12, skin: 5, hat: 4, accessory: 3 }}
      />
    </LocaleProvider>
  );

  assert.match(html, /全部/);
  assert.match(html, /12/);
  assert.match(html, /外壳/);
  assert.match(html, /5/);
  assert.match(html, /帽子/);
  assert.match(html, /4/);
  assert.match(html, /饰品/);
  assert.match(html, /3/);
});

test("CategoryTabs renders a search input", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="all"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={{ all: 12, skin: 5, hat: 4, accessory: 3 }}
      />
    </LocaleProvider>
  );

  assert.match(html, /<input/);
  assert.match(html, /type="text"/);
});

test("CategoryTabs highlights active tab", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="hat"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={{ all: 12, skin: 5, hat: 4, accessory: 3 }}
      />
    </LocaleProvider>
  );

  // The active tab should have the accent styling class
  assert.match(html, /bg-accent\/15/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/components/shop/category-tabs.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/components/shop/category-tabs.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import type { TranslationKey } from "@/i18n";

const TAB_OPTIONS = [
  { key: "all", labelKey: "shop.filter.all" as TranslationKey },
  { key: "skin", labelKey: "shop.category.skin" as TranslationKey },
  { key: "hat", labelKey: "shop.category.hat" as TranslationKey },
  { key: "accessory", labelKey: "shop.category.accessory" as TranslationKey },
] as const;

interface CategoryTabsProps {
  active: string;
  onTabChange: (tab: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  counts: Record<string, number>;
  t: (key: TranslationKey) => string;
}

export function CategoryTabs({
  active,
  onTabChange,
  search,
  onSearchChange,
  counts,
  t,
}: CategoryTabsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto">
        {TAB_OPTIONS.map(({ key, labelKey }) => {
          const isActive = active === key;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "bg-foreground/5 text-muted hover:text-foreground hover:bg-foreground/[0.08]"
              }`}
            >
              {t(labelKey)}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? "bg-accent/20 text-accent"
                    : "bg-foreground/5 text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative sm:w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("shop.search.placeholder")}
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-card-border/40 bg-card/60 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/30 transition-colors"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/components/shop/category-tabs.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/shop/category-tabs.tsx src/components/shop/category-tabs.test.tsx
git commit -m "feat(shop): add category tabs with search input"
```

---

## Chunk 5: Item Detail Drawer

### Task 7: Create Item Drawer Component

A slide-out overlay that shows a detailed view of a selected shop item with a large lobster preview. Uses `onClick` on the backdrop div + `stopPropagation` on the panel to implement click-outside-to-close.

**Files:**
- Create: `src/components/shop/item-drawer.tsx`
- Create: `src/components/shop/item-drawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/shop/item-drawer.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/i18n";
import { ItemDrawer } from "./item-drawer";

const sampleItem = {
  id: "crown",
  name: "Crown",
  description: "A royal crown for the top agent",
  type: "hat",
  category: "hat",
  price: 200,
  spriteKey: "crown",
};

test("ItemDrawer renders nothing when item is null", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={null} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.equal(html, "");
});

test("ItemDrawer renders item details when item is provided", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Crown/);
  assert.match(html, /A royal crown/);
  assert.match(html, /200/);
});

test("ItemDrawer renders a large canvas preview", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /<canvas/);
  assert.match(html, /width="160"/);
  assert.match(html, /height="160"/);
});

test("ItemDrawer renders category and type info", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/components/shop/item-drawer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/components/shop/item-drawer.tsx`.

**Key design decision:** The backdrop click-to-close uses `onClick={onClose}` on the backdrop `<div>` and `onClick={(e) => e.stopPropagation()}` on the drawer panel. This is simpler and more reliable than a `ref`-based `e.target` check, because `e.target` would hit the backdrop div (not the outer container), making the ref comparison fail.

```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/i18n";
import { LobsterPreview } from "./lobster-preview";
import { itemToAppearance, CATEGORY_KEYS, type ShopItemData } from "./utils";

interface ItemDrawerProps {
  item: ShopItemData | null;
  onClose: () => void;
}

export function ItemDrawer({ item, onClose }: ItemDrawerProps) {
  const t = useT();

  useEffect(() => {
    if (!item) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const appearance = itemToAppearance(item);
  const categoryLabel = CATEGORY_KEYS[item.category]
    ? t(CATEGORY_KEYS[item.category])
    : item.category;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Backdrop — clicking closes the drawer */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel — stopPropagation prevents backdrop close */}
      <div
        className="relative w-full max-w-md h-full bg-background/95 backdrop-blur-2xl border-l border-card-border/50 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg hover:bg-foreground/5 transition-colors"
        >
          <X className="w-5 h-5 text-muted" />
        </button>

        {/* Preview area */}
        <div className="flex items-center justify-center bg-gradient-to-b from-foreground/[0.04] to-transparent pt-12 pb-8">
          <LobsterPreview appearance={appearance} size={160} />
        </div>

        {/* Content */}
        <div className="px-6 pb-8 space-y-6">
          {/* Title & Price */}
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              {item.name}
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-muted/10 text-muted/80 border border-muted/10">
                {categoryLabel}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-warning font-display">
                  {item.price}
                </span>
                <span className="text-xs uppercase tracking-[0.15em] text-muted">
                  pts
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("shop.drawer.description")}
            </h3>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-card-border/30 bg-card/40 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
                {t("shop.drawer.type")}
              </p>
              <p className="text-sm font-medium text-foreground">
                {item.type}
              </p>
            </div>
            <div className="rounded-xl border border-card-border/30 bg-card/40 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">
                {t("shop.drawer.spriteKey")}
              </p>
              <p className="text-sm font-medium text-foreground font-mono">
                {item.spriteKey}
              </p>
            </div>
          </div>

          {/* Agent purchase hint */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-xs text-muted leading-relaxed">
              {t("shop.drawer.agentHint")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/components/shop/item-drawer.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/shop/item-drawer.tsx src/components/shop/item-drawer.test.tsx
git commit -m "feat(shop): add item detail drawer with large avatar preview"
```

---

## Chunk 6: Shop Page Integration

### Task 8: Refactor Shop Page — Wire All Components Together

Replace the old `ShopCatalogContent` with the new components.

**Files:**
- Modify: `src/app/shop/page.tsx`
- Modify: `src/app/shop/page.test.tsx`

- [ ] **Step 1: Rewrite page.tsx**

Replace the entire content of `src/app/shop/page.tsx` with:

```tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchShopItems } from "@/lib/shop-client";
import { useT } from "@/i18n";
import { CategoryTabs } from "@/components/shop/category-tabs";
import { ItemCard } from "@/components/shop/item-card";
import { ItemDrawer } from "@/components/shop/item-drawer";
import { SortSelect, type SortOption } from "@/components/shop/sort-select";
import type { ShopItemData } from "@/components/shop/utils";

function sortItems(items: ShopItemData[], sort: SortOption): ShopItemData[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}

export default function ShopPage() {
  const t = useT();
  const [items, setItems] = useState<ShopItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [selectedItem, setSelectedItem] = useState<ShopItemData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const catalog = await fetchShopItems();
        if (cancelled) return;
        setItems(catalog as ShopItemData[]);
      } catch (nextError) {
        if (cancelled) return;
        setError(
          nextError instanceof Error ? nextError.message : t("shop.actionFailed")
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => { cancelled = true; };
  }, [t]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeTab !== "all") {
      result = result.filter((item) => item.category === activeTab);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }
    return sortItems(result, sort);
  }, [items, activeTab, search, sort]);

  const handleCloseDrawer = useCallback(() => setSelectedItem(null), []);

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("shop.title")}
          description={t("shop.subtitle")}
        />
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("shop.title")}
        description={t("shop.subtitle")}
        rightSlot={
          <Card className="p-4 sm:min-w-[180px]">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {t("shop.balance")}
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-warning">
              —
            </p>
          </Card>
        }
      />

      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CategoryTabs
            active={activeTab}
            onTabChange={setActiveTab}
            search={search}
            onSearchChange={setSearch}
            counts={categoryCounts}
            t={t}
          />
          <SortSelect value={sort} onChange={setSort} t={t} />
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-card-border/50 bg-card/60 p-0 overflow-hidden"
            >
              <div className="h-28 bg-foreground/[0.03]" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-2/3 rounded bg-card-border/50" />
                <div className="h-3 w-full rounded bg-card-border/30" />
                <div className="flex justify-between">
                  <div className="h-3 w-16 rounded bg-card-border/30" />
                  <div className="h-5 w-12 rounded bg-card-border/30" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={t("shop.empty")}
          description={t("shop.emptyDescription")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={setSelectedItem}
            />
          ))}
        </div>
      )}

      <ItemDrawer item={selectedItem} onClose={handleCloseDrawer} />
    </div>
  );
}
```

- [ ] **Step 2: Update page tests**

Replace the entire content of `src/app/shop/page.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ShopPage from "./page";
import { LocaleProvider } from "@/i18n";

test("shop page renders header with title and balance card", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  assert.match(html, /商店/);
  assert.match(html, /余额/);
});

test("shop page renders loading skeleton on initial render", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  // Should have skeleton placeholders (animate-pulse)
  assert.match(html, /animate-pulse/);
});
```

- [ ] **Step 3: Run tests**

Run: `node --import tsx --test src/app/shop/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add src/app/shop/page.tsx src/app/shop/page.test.tsx
git commit -m "feat(shop): integrate category tabs, enhanced cards, sort, and item drawer"
```

---

## Chunk 7: Final Verification

### Task 9: Full Build, Lint, and Test Verification

Ensure everything works together.

- [ ] **Step 1: Run all shop-related tests**

```bash
node --import tsx --test src/components/shop/lobster-preview.test.tsx src/components/shop/item-card.test.tsx src/components/shop/category-tabs.test.tsx src/components/shop/item-drawer.test.tsx src/app/shop/page.test.tsx
```

Expected: All tests PASS

- [ ] **Step 2: Run lint on all changed files**

```bash
npx next lint --file src/components/shop/lobster-preview.tsx --file src/components/shop/item-card.tsx --file src/components/shop/category-tabs.tsx --file src/components/shop/item-drawer.tsx --file src/components/shop/sort-select.tsx --file src/components/shop/utils.ts --file src/app/shop/page.tsx
```

Expected: No errors

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass (existing + new)

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: Build succeeds without errors

- [ ] **Step 5: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "chore(shop): lint and build verification"
```
