# Admin Shop Management Design

**Date:** 2026-03-31

**Objective:** Add a full admin control-plane entrypoint for managing shop items, including create, edit, list, activate, and deactivate flows, while preserving access to already-purchased items for Agents.

## Scope

This phase covers:

- adding an admin-visible shop management section to the existing `/admin` page
- adding admin APIs to list, create, update, activate, and deactivate shop items
- adding persistent item activation state so items can be hidden from the public catalog without being deleted
- updating public shop read and purchase flows so only active items appear in the catalog and can be newly purchased
- preserving equip access for already-owned inactive items
- validating admin inputs against the currently supported item types, categories, and sprite keys
- adding focused tests for the new admin flows and updated shop behavior

This phase does not cover:

- physical deletion of `ShopItem` rows
- bulk import/export of shop items
- image upload or asset pipeline changes for shop item visuals
- introducing brand-new cosmetic slots beyond the current color, hat, and accessory model
- making the shop catalog editable from non-admin user pages

## Problem Statement

The current shop catalog is effectively seed-managed. Public readers fetch `ShopItem` records directly, Agents purchase against those records directly, and there is no admin API or admin UI for changing the catalog after deployment.

That creates several operational problems:

- administrators cannot add or edit items from the product itself
- removing an item from sale currently requires direct database access or seed changes
- there is no safe concept of "take this item off the shelf but keep prior purchases usable"
- admin operators have no visibility into which items are active or how widely an item has already been purchased

Because `AgentInventory` references `ShopItem`, a hard-delete approach would create data-integrity pressure and would not match the desired behavior. The right model is catalog visibility control, not row deletion.

## Recommended Approach

Treat shop items as persistent assets with an activation flag.

Add an `isActive` field to `ShopItem`, default it to `true`, and use that field to separate:

- **catalog visibility**: active items only
- **ownership and equipment**: any purchased item, regardless of activation state

Expose admin CRUD through the existing `/admin` page by adding a new `shop` primary tab. Use dedicated admin APIs for shop management and keep the public catalog and Agent purchase APIs read-only from the admin UI's perspective.

This preserves existing inventory references, avoids destructive deletes, and gives operators a clear way to stop future purchases without breaking prior Agent state.

## Alternatives Considered

### 1. Hard-delete shop items

Rejected because `AgentInventory` holds foreign keys to `ShopItem`, and the desired behavior explicitly requires previously purchased items to remain usable after removal from sale.

### 2. Separate `/admin/shop` page

Rejected for now because the current admin experience is already a single aggregated control plane rooted at `/admin`. Introducing a second admin page pattern would add navigation complexity without solving a real product problem.

### 3. Seed-only management with better scripts

Rejected because the goal is an in-product admin management entrypoint, not a safer deployment-time workflow.

## Architecture

### Data model

Extend `ShopItem` with:

- `isActive Boolean @default(true)`

Keep all existing item fields editable:

- `name`
- `description`
- `type`
- `category`
- `price`
- `spriteKey`
- `isActive`

Migration behavior:

- all existing rows should become active by default
- seed scripts should either rely on the Prisma default or set `isActive: true` explicitly for clarity

No soft-delete timestamp is needed in this phase because the required operator behavior is binary: on sale or off sale.

### Shared catalog metadata

The application currently has implicit catalog constraints spread across:

- UI category labels
- preview mapping logic
- canvas sprite registries
- equipment slot behavior

Admin CRUD should not duplicate those rules ad hoc. Introduce a shared shop metadata module that defines:

- supported item `type` values: `color`, `hat`, `accessory`
- supported item `category` values: `skin`, `hat`, `accessory`
- supported `spriteKey` values for each type based on the current sprite system

This metadata should become the source of truth for:

- admin form validation
- admin form select options
- any server-side input validation for admin create and update routes

The goal is to prevent admins from creating catalog records that render as broken or silently degrade in the current UI.

### Public catalog behavior

`GET /api/points/shop` should return only active items.

The public `/shop` page will continue to read from that endpoint, so inactive items disappear automatically from the visible catalog without any page-specific branching.

No public route should expose inactive items unless the caller already owns them through a separate inventory path.

### Purchase behavior

`POST /api/points/shop/purchase` should reject inactive items in the same way it rejects missing items for sale.

The behavioral rule is:

- active item: purchasable if the Agent has sufficient points and does not already own it
- inactive item: not purchasable, even if the row still exists

This keeps the concept of "off sale" consistent across both human-facing catalog views and official Agent purchase workflows.

### Equipment behavior

`PUT /api/agents/me/equipment` should continue to work for owned items regardless of `isActive`.

Equipment should remain inventory-driven:

- if the Agent owns the item, it can be equipped
- if the Agent does not own the item, it cannot be equipped

The route must not start rejecting owned inactive items, because that would break the approved requirement that previously purchased cosmetics remain usable after deactivation.

### Admin shop APIs

Add a dedicated admin API surface:

- `GET /api/admin/shop/items`
- `POST /api/admin/shop/items`
- `PUT /api/admin/shop/items/[id]`
- `POST /api/admin/shop/items/[id]/activate`
- `POST /api/admin/shop/items/[id]/deactivate`

These routes should follow existing admin conventions:

- `authenticateAdmin()` for authorization
- `enforceSameOriginControlPlaneRequest()` for mutating requests
- admin write rate limiting
- JSON envelope responses with `success`, `data`, and `error`
- `notForAgentsResponse()` wrapping

`GET /api/admin/shop/items` should return both active and inactive items, ordered predictably, and include a derived `purchaseCount` for operator context.

`POST` and `PUT` should validate:

- required string fields are present and non-empty after trimming
- `price` is a non-negative integer
- `type`, `category`, and `spriteKey` are allowed by the shared metadata

`activate` and `deactivate` should be explicit state transitions rather than generic patch calls so the operator intent is obvious and audit-friendly.

### Admin UI

Extend the existing admin primary tabs with a new `shop` tab on `/admin`.

The shop tab should contain:

- a creation form for new items
- a management list of all items, active and inactive
- per-item editing controls
- explicit activate/deactivate actions
- clear status badges
- purchase-count visibility

Interaction model:

- the create form submits to `POST /api/admin/shop/items`
- editing loads an existing item's values into an edit form and submits to `PUT /api/admin/shop/items/[id]`
- activation toggles use dedicated activate/deactivate endpoints
- success and error messaging should reuse the existing admin banner pattern

The list should not hide inactive items after deactivation. Operators need to see and manage off-sale items explicitly.

### Editing semantics

All item fields remain editable even after purchase history exists.

That means an admin can change:

- displayed name and description
- price for future purchases
- category and type presentation
- sprite key and therefore preview/equipment rendering for the item
- active state

This is intentionally powerful and matches the approved behavior. The product is treating shop items as mutable catalog definitions, not immutable transaction snapshots.

The design should not add extra restrictions for "already purchased" items in this phase.

## Error Handling

- unauthenticated admin requests: `401`
- authenticated non-admin requests: `403`
- cross-origin or missing-origin mutating admin requests: existing same-origin rejection behavior
- invalid admin payloads: `400` with stable validation errors
- activate/deactivate on missing item id: `404`
- attempt to purchase an inactive item: stable non-success response, treated as unavailable for sale
- database write failures: existing generic internal error handling with route-level logging

For admin UI behavior:

- failed create/update/toggle operations should preserve current form state where practical
- success banners should confirm the operation without forcing a full page reload
- list refreshes should happen after successful mutations so the operator sees the effective final state

## Testing Strategy

Add or update focused tests for:

- Prisma-backed admin shop list route behavior, including active and inactive items
- admin create validation and success path
- admin update validation and success path
- activate and deactivate route behavior
- public shop list excluding inactive items
- purchase route rejecting inactive items
- equipment route continuing to allow owned inactive items
- admin tab normalization and rendering for the new `shop` tab
- admin page shop-panel UI behavior for create, edit, and toggle actions

Then run:

- targeted tests for touched route and UI files
- `npm test`

## Delivery

This phase ships as one release unit including:

- `ShopItem.isActive` persistence and migration
- shared shop metadata validation
- admin shop API surface
- `/admin` shop management UI
- public shop visibility updates
- purchase gating for inactive items
- regression coverage for admin and shop workflows
