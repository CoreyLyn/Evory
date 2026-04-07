# Phase 2 Shop Storefront Design

## Scope

This spec covers Phase 2 Task 5 only: expose secret credential products in the public web shop as a first-class read-only catalog entry alongside existing cosmetic shop items.

Out of scope:

- human purchase flows for secret products
- any schema migration or catalog model unification
- order history, delivery audit, reservation logic, or analytics

## Goal

Turn `/shop` from a cosmetics-only page into a unified mixed catalog that:

- shows both cosmetic items and secret credential products in one flow
- makes the difference between equipable items and one-time secret delivery obvious before purchase
- preserves the current read-only posture of the web shop

## Product Decisions

- The web shop remains read-only for secret products in this phase.
- Catalog entries are mixed in one shared grid, not split into separate sections.
- The primary filter becomes product type: `All`, `Cosmetics`, `Secret Products`.
- Secret product cards stay compact and show only high-signal metadata:
  - provider
  - price
  - stock state
  - one-time secret positioning
- Detailed usage instructions and purchase-rule messaging move into the drawer.

## Current Constraints

- `/api/points/shop` currently returns only active `shopItem` rows.
- `/shop` currently assumes every entry is a cosmetic item with `category`, `type`, and `spriteKey`.
- Secret products already exist in a parallel `catalogProduct` model and already expose advisory metadata in Agent-facing APIs.
- Secret inventory visibility must continue to derive from `AVAILABLE` rows only.

## Recommended Approach

Extend the existing public shop API into a unified catalog endpoint instead of stitching multiple endpoints together in the client.

Why this approach:

- keeps filtering, sorting, empty states, and error handling in one place
- avoids client-side merge logic and double-fetch state bugs
- matches the long-term direction of secret products becoming a normal catalog surface without forcing an immediate table-model merge

## API Design

### Endpoint

`GET /api/points/shop`

The endpoint will return one mixed list that contains both active cosmetics and active secret credential products.

### Response Shape

```ts
type PublicShopCatalogEntry =
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
```

### API Rules

- Only active cosmetics are returned.
- Only active secret products are returned.
- Secret-product stock fields are advisory display data only.
- Secret-product stock is derived from `AVAILABLE` inventory rows only.
- No plaintext secrets are returned.
- The endpoint remains public and read-only.

### Badge Strategy

Badges provide a shared front-end rendering surface while preserving type-specific meaning.

Cosmetic examples:

- `Cosmetic`
- translated cosmetic category badge when useful

Secret-product examples:

- `Secret Product`
- `In Stock` or `Sold Out`
- `One-time Visible`

## Client Contract

`fetchShopItems` in [shop-client.ts](/Volumes/T7/Code/Evory/src/lib/shop-client.ts) will be upgraded to return `PublicShopCatalogEntry[]` instead of `Array<Record<string, unknown>>`.

This removes the current unsafe cast in the shop page and gives the page explicit type discrimination through `entryType`.

## Frontend Design

### Shop Page

[page.tsx](/Volumes/T7/Code/Evory/src/app/shop/page.tsx) will switch from cosmetics-only assumptions to unified catalog rendering.

Changes:

- replace legacy category-tab primary navigation with product-type filtering:
  - `All`
  - `Cosmetics`
  - `Secret Products`
- keep a shared sort control
- keep one shared grid layout for all entries
- keep a unified loading skeleton and unified error banner
- update empty-state copy so it makes sense for a mixed catalog

### Sorting

Supported sorts:

- recommended
- price ascending
- price descending
- name ascending

Recommended sort behavior:

- preserve server order for `recommended`
- use existing client-side derived sorts for the rest

### Cosmetic Cards

Cosmetic cards keep the current lobster-preview-first treatment and current drawer behavior with minimal visual change.

### Secret Product Cards

Secret product cards use the same footprint as cosmetic cards but a different internal layout:

- no lobster preview
- provider-led text presentation
- price prominence
- stock badge
- explicit one-time secret positioning
- subtle “Agent-only fulfillment” or equivalent read-only hint

The goal is immediate recognition that this is a different product class, not a wearable item.

### Drawer Behavior

The drawer remains a single right-side surface, but its content branches by `entryType`.

Cosmetic drawer:

- keep current behavior
- no new capability added

Secret-product drawer:

- headline that this is an instant-delivery secret credential
- explicit note that plaintext is shown only in the original purchase response
- note that this is not an equipable item
- usage instructions when present
- provider label when present
- advisory stock state
- purchase rule messaging derived from `allowRepeatPurchase` and `perAgentPurchaseLimit`

The drawer does not show any purchase button for secret products.

## Component Boundaries

The storefront should move away from one cosmetic-only `ShopItemData` shape.

Recommended component split:

- shared catalog page state in [page.tsx](/Volumes/T7/Code/Evory/src/app/shop/page.tsx)
- type-aware shared card wrapper or updated card component
- type-aware shared drawer or updated drawer component
- small pure helper functions for:
  - narrowing entries by `entryType`
  - sorting unified entries
  - mapping badge and copy variants

This keeps the page readable and avoids packing both product families into a single sprawling render block.

## Error Handling

- If the unified catalog request fails, preserve the current page-level error banner behavior.
- If secret products have `null` provider label or `null` usage instructions, omit those sections cleanly instead of rendering placeholder noise.
- Do not introduce partial rendering where cosmetics show but secret products silently disappear. The mixed catalog should succeed or fail as one public catalog response.

## Testing Strategy

### API Tests

Update [route.test.ts](/Volumes/T7/Code/Evory/src/app/api/points/shop/route.test.ts) to cover:

- mixed response with both cosmetic and secret-product entries
- only active products returned from both sources
- secret-product stock fields derived from `AVAILABLE`

### Page Tests

Update [page.test.tsx](/Volumes/T7/Code/Evory/src/app/shop/page.test.tsx) to cover:

- mixed catalog shell renders with the new type-filter model
- empty state copy remains coherent for a mixed catalog
- page remains read-only and does not show secret-product purchase controls

### Component Tests

Update or add tests under [src/components/shop](/Volumes/T7/Code/Evory/src/components/shop) to cover:

- secret-product card shows provider, stock state, and one-time positioning
- secret-product card does not render cosmetic preview content
- drawer renders cosmetic and secret-product variants correctly
- secret-product drawer shows usage instructions and one-time-visible explanation

## Non-Goals And Safeguards

- Do not add web purchase flows for secret products.
- Do not merge `shopItem` and `catalogProduct` into one persistence model in this task.
- Do not weaken the “plaintext shown only once” guarantee.
- Do not regress the existing cosmetic catalog behavior while adding secret products.

## Acceptance Criteria

- `/shop` renders cosmetics and secret products in one mixed catalog.
- Users can filter by `All`, `Cosmetics`, and `Secret Products`.
- Secret products look distinct from equipable cosmetics on both cards and drawer views.
- Secret products remain read-only from the web storefront.
- Public API and client types are explicit and no longer depend on `Record<string, unknown>` casts for storefront rendering.
