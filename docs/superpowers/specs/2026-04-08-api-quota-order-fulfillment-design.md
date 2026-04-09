# API Quota Order Fulfillment Design

**Date:** 2026-04-08

**Objective:** Replace the current secret credential product workflow with an admin-provided API quota workflow where Agents can spend points to create pending quota orders, and administrators fulfill those orders by assigning one of the provided API keys and confirming completion.

## Scope

This phase covers:

- replacing secret credential shop products with API quota products
- keeping Agent-only purchasing for API quota products
- allowing administrators to register and manage the provided API keys used for fulfillment
- creating pending purchase orders when an Agent buys API quota
- exposing admin order management that includes buyer, owning user, assigned API key, quota amount, and order status
- allowing administrators to confirm an order as fulfilled after assigning an API key
- updating public and Agent shop catalog views to describe quota fulfillment instead of instant secret delivery
- updating Agent order history to show order status, quota details, and masked API key information only
- preserving the existing cosmetic shop item flow unchanged

This phase does not cover:

- direct user purchases from the non-Agent user UI
- automated quota provisioning against external providers
- exposing full API key values back to Agents after order creation
- wallet refunds, partial fulfillment, or order cancellation flows
- provider-side usage metering or quota depletion tracking after fulfillment

## Problem Statement

The current non-cosmetic shop workflow treats secret products as stocked credentials that are imported into inventory and delivered immediately during purchase. That no longer matches the desired product behavior.

The new requirements are:

- API keys are supplied by administrators, not purchased as inventory rows by Agents
- Agents buy API quota, not raw credentials
- an Agent purchase should create an order that an administrator can review and confirm
- administrators need visibility into which buyer placed the order, which API key was assigned, and how much quota was purchased
- the Agent should not receive a full credential as an automatic purchase response

If the existing secret-inventory fulfillment flow remains in place, the data model and UI will keep implying instant delivery of stocked secrets, which is the opposite of the intended manual confirmation workflow.

## Recommended Approach

Keep the current shop product and order backbone, but repurpose it for API quota fulfillment.

Use `CatalogProduct` and `PurchaseOrder` as the persistent backbone for quota products and orders. Introduce a new administrator-managed `ProvidedApiKey` model that stores the pool of API keys available for assignment during order fulfillment. Change the Agent purchase flow so a quota purchase creates a `PENDING` order after points are deducted, and remove the immediate secret delivery path for new purchases.

Administrators then fulfill orders from the admin control plane by selecting a provided API key and confirming completion. The order becomes `FULFILLED`, records the assigned API key, and exposes only masked key information to Agent-visible history.

This approach keeps the existing storefront, order listing, and admin panel structure recognizable while changing the business meaning from stock delivery to manual quota fulfillment.

## Alternatives Considered

### 1. Build a completely separate API quota commerce system

Rejected because the existing product, order, and admin catalog structure already maps well to the new workflow. A fully separate system would duplicate large parts of the current shop surface without adding product value.

### 2. Keep the current secret inventory model and reinterpret each stored secret as an API key

Rejected because the current inventory semantics imply immediate stock consumption and automated delivery. That model is a poor fit for an order-confirmation workflow and would keep the codebase full of misleading names and behaviors.

### 3. Keep the current schema names for compatibility and only change UI labels

Rejected because the current naming is deeply tied to the wrong business meaning. Continuing to use `secret` terminology for quota fulfillment would make future maintenance and auditing harder.

## Architecture

### Product model

Continue using `CatalogProduct` for non-cosmetic storefront products, but migrate the business meaning from `SECRET_CREDENTIAL` to `API_QUOTA`.

`CatalogProductType` should include:

- `COSMETIC`
- `API_QUOTA`

Each API quota product should define:

- `name`
- `description`
- `price`
- `currencyType`
- `isActive`
- `displayConfig`
- `fulfillmentConfig`

Recommended config fields:

- `displayConfig.providerLabel`: human-friendly provider name
- `displayConfig.usageInstructions`: fulfillment guidance shown in admin and Agent UI
- `displayConfig.quotaUnitLabel`: display unit such as `tokens`, `calls`, or `credits`
- `fulfillmentConfig.quotaAmount`: the amount granted for one purchase
- `fulfillmentConfig.allowRepeatPurchase`
- `fulfillmentConfig.perAgentPurchaseLimit`

The quota amount must be defined on the product and copied into the order at purchase time so the purchased quantity is immutable once the order is created.

### Provided API keys

Add a new `ProvidedApiKey` model that represents administrator-managed credentials available for assignment during fulfillment.

Recommended fields:

- `id`
- `label`
- `providerLabel`
- `maskedKey`
- `encryptedKey`
- `isActive`
- `createdByUserId`
- `createdAt`
- `updatedAt`

Behavioral rules:

- administrators can create and deactivate provided API keys
- full key values are stored encrypted at rest
- admin list and order views show masked values only by default
- inactive keys cannot be newly assigned to pending orders
- the same provided API key may be associated with multiple orders unless a later product rule requires exclusivity

This phase treats a provided API key as a reusable assigned credential, not a consumable stock unit.

### Order model

Continue using `PurchaseOrder` as the system of record for quota purchases, with added quota and fulfillment assignment fields.

Recommended additional fields:

- `quotaAmount Int`
- `quotaUnitLabel String`
- `providedApiKeyId String?`
- `confirmedByUserId String?`
- `confirmedAt DateTime?`

Existing fields remain relevant:

- `buyerAgentId`
- `productId`
- `pricePaid`
- `currencyType`
- `status`
- `failureReason`
- `createdAt`
- `fulfilledAt`

Order lifecycle:

- `PENDING`: Agent has purchased quota and points were deducted, but no admin confirmation has happened yet
- `FULFILLED`: administrator assigned a provided API key and confirmed the order
- `FAILED`: reserved for explicit admin failure handling or future provider-side errors

For this phase, administrators do not edit order price or quota at confirmation time. The purchase defines the commercial terms, and fulfillment only confirms delivery against those terms.

### Retiring secret inventory delivery

`SecretInventory` and `SecretDeliveryReceipt` should no longer participate in new purchases once API quota fulfillment ships.

Migration direction:

- historical data may remain readable if needed during transition
- new API quota purchases must not allocate `SecretInventory`
- Agent purchase responses must not return full credentials
- admin product management must remove inventory import and inventory void flows for new quota products

The implementation can choose between full schema replacement or a transition period where old tables remain for legacy rows, but the live quota workflow must not depend on secret inventory behavior.

## Data Flow

### Agent purchase flow

1. Agent browses the shop catalog and sees active cosmetic items plus active API quota products.
2. Agent purchases an API quota product by `productId`.
3. The purchase route validates:
   - the product exists and is active
   - the product type is `API_QUOTA`
   - repeat-purchase rules permit the order
   - the Agent has sufficient points
4. The system deducts points and creates a `PurchaseOrder` with:
   - `status = PENDING`
   - copied `pricePaid`
   - copied `currencyType`
   - copied `quotaAmount`
   - copied `quotaUnitLabel`
5. The API responds with order metadata only. No full API key is returned.

### Admin fulfillment flow

1. Administrator opens the admin shop control plane.
2. Administrator reviews pending quota orders.
3. For a selected order, the admin chooses an active provided API key.
4. The system records:
   - `providedApiKeyId`
   - `confirmedByUserId`
   - `confirmedAt`
   - `fulfilledAt`
   - `status = FULFILLED`
5. The order then appears as fulfilled in admin and Agent order history.

### Agent order history flow

Agent order history should show:

- order id
- product name
- order status
- price paid
- quota amount and unit
- created time
- fulfilled time
- assigned API key masked value, if fulfilled

It must not return encrypted key material or a full plain-text API key.

## API Surface

### Public and Agent shop catalog

Update:

- `GET /api/points/shop`
- `GET /api/agent/shop`

Catalog entries for non-cosmetic products should represent API quota products instead of secret products.

Recommended response fields:

- `entryType: "api_quota_product"`
- `id`
- `name`
- `description`
- `price`
- `currencyType`
- `providerLabel`
- `usageInstructions`
- `quotaAmount`
- `quotaUnitLabel`
- `allowRepeatPurchase`
- `perAgentPurchaseLimit`

Remove stock-oriented response fields such as `availableInventoryCount` and `isInStock` for quota products.

### Purchase route

Update:

- `POST /api/points/shop/purchase`
- by delegation, also `POST /api/agent/shop/purchase`

Behavior for `productId` purchases:

- no instant fulfillment path
- no inventory claim
- create pending order after successful point deduction
- return order summary payload rather than secret delivery payload

Recommended success payload:

- `orderId`
- `status`
- `product`
- `quota`
- `message` indicating admin confirmation is required

### Admin product management

Update:

- `GET /api/admin/shop/products`
- `POST /api/admin/shop/products`
- `PUT /api/admin/shop/products/[id]`

Admin product management should operate on API quota products and validate:

- `productType = API_QUOTA`
- non-negative price
- positive `quotaAmount`
- required `quotaUnitLabel`
- valid repeat-purchase rules

The old inventory import endpoint should be removed from the primary admin workflow for quota products.

### Admin provided API key management

Add:

- `GET /api/admin/shop/api-keys`
- `POST /api/admin/shop/api-keys`
- `PUT /api/admin/shop/api-keys/[id]`

These routes should support:

- listing active and inactive provided API keys
- creating a provided API key with encrypted storage and masked display value
- updating label, provider label, and activation state

This phase does not require exposing plain-text key values after creation.

### Admin order management

Update:

- `GET /api/admin/shop/orders`

Add:

- `POST /api/admin/shop/orders/[id]/fulfill`

Admin order listing should include:

- order id
- status
- buyer Agent info
- owner user info when present
- product info
- quota amount and unit
- assigned API key masked value
- confirmation timestamps

The fulfill route should validate:

- order exists
- order status is `PENDING`
- order product type is `API_QUOTA`
- selected provided API key exists and is active

Successful fulfillment should transition the order atomically to `FULFILLED`.

### Agent order history

Update:

- `GET /api/agent/shop/orders`

Agent-visible order history should return:

- status and timestamps
- product metadata
- quota metadata
- masked assigned API key data when fulfilled

It must no longer expose secret-delivery receipt fields that imply immediate key delivery.

## Admin UI

Extend the existing admin shop panel rather than creating a separate admin destination.

Recommended admin sections:

### 1. API quota products

Replace the current secret-product editor with an API quota product editor containing:

- name
- description
- price
- provider label
- usage instructions
- quota amount
- quota unit label
- repeat purchase toggle
- per-Agent purchase limit
- activation toggle

Remove inventory import and inventory detail sections from the new quota workflow.

### 2. Provided API keys

Add a dedicated management section for administrator-supplied API keys with:

- create form
- list of existing keys
- status badge
- masked key display
- provider label
- associated order count if practical

### 3. Orders

Keep the order history section, but shift it to fulfillment operations.

For pending orders, admins should be able to:

- filter by status, product, and buyer
- inspect buyer Agent and owner user information
- inspect purchased quota amount
- select an active provided API key
- confirm fulfillment

For fulfilled orders, show:

- who confirmed the order
- when it was confirmed
- which masked API key was assigned

## Agent UI

Shop cards, drawers, and order history must stop describing these products as stocked secrets.

Recommended changes:

- rename the product presentation from secret credential to API quota
- show quota amount and unit prominently on the card
- replace stock language with admin-confirmation language
- after purchase, show that the order is pending admin confirmation
- in order history, show masked API key data only after fulfillment

The cosmetic flow should remain unchanged.

## Validation and Error Handling

### Purchase errors

- missing or inactive quota product: `404`
- insufficient points: `400`
- repeat purchase blocked or per-Agent limit exceeded: `409`
- malformed request body: `400`
- database write failure: `500`

### Fulfillment errors

- missing order: `404`
- non-pending order: `409`
- inactive or missing provided API key: `400`
- unauthorized admin request: existing `401` and `403` behavior
- CSRF or same-origin failure on admin write routes: existing rejection behavior

### Safety rules

- no API response outside admin creation flow should expose plain-text provided API keys
- Agent-visible routes should only expose masked key values
- order creation and point deduction must remain transactional
- order fulfillment should be atomic to avoid partially updated assignment state

## Migration Strategy

The implementation should perform an explicit semantic migration from secret credential products to API quota products.

Recommended migration behavior:

- replace or migrate `CatalogProductType.SECRET_CREDENTIAL` to `API_QUOTA`
- add `PurchaseOrder` quota fields and provided-key assignment fields
- create the new `ProvidedApiKey` table
- remove new-code dependencies on `SecretInventory` and `SecretDeliveryReceipt`
- migrate UI copy, client types, and route payload names away from `secret product`

Historical rows may remain in place temporarily if required for rollout safety, but the live product language and behavior must be quota-first.

## Testing Strategy

Add or update focused tests for:

- admin API quota product creation and update validation
- admin provided API key create, list, update, and activation behavior
- Agent purchase route creating pending orders instead of instant secret delivery
- repeat purchase limit enforcement for quota products
- admin order list including buyer, owning user, quota, and assigned key data
- admin fulfill route assigning a provided API key and marking the order fulfilled
- Agent order history showing quota and masked key data only
- public and Agent shop catalog serialization for `api_quota_product`
- admin panel rendering without inventory import UI and with provided-key management UI

Then run:

- targeted tests for touched routes, client helpers, and admin UI
- `npm test`

## Delivery

This phase ships as one coherent quota-commerce release unit including:

- API quota product modeling
- provided API key management
- pending-order purchase flow
- admin order fulfillment flow
- updated admin and Agent shop UI copy and payloads
- regression coverage for the new order lifecycle
