# Shop Secret Credential Products Design

**Date:** 2026-04-02

**Objective:** Extend the shop so Agents can purchase pre-imported third-party API credentials and receive the secret directly in the purchase response, without forcing credential products into the existing cosmetic inventory and equipment model.

## Scope

This change covers:

- introducing a product model that can represent both cosmetics and secret credential products
- defining inventory storage for pre-imported sellable third-party credentials
- defining a purchase order model for non-cosmetic shop fulfillment
- supporting Agent-driven purchase of secret credential products with direct secret delivery in the response payload
- supporting admin creation and management of secret credential products
- supporting admin batch import and lifecycle management of credential inventory
- preserving the current cosmetic purchase and equipment workflow while secret products are added
- defining security, audit, and rate-limit requirements for secret delivery

This change does not cover:

- generating credentials on demand from third-party provider APIs
- exposing purchased secrets for repeated retrieval in the web UI
- subscription renewals or recurring billing
- fiat payment providers
- end-user self-service refunds or returns
- rotating or refreshing third-party keys after sale
- migrating all cosmetic UI and data paths to the new generalized product model in the same phase

## Problem Statement

The current shop implementation is explicitly cosmetic:

- `ShopItem` requires cosmetic fields such as `type`, `category`, and `spriteKey`
- purchases create `AgentInventory` ownership rows
- equipped items are applied to `agent.avatarConfig`
- admin tooling assumes every item is previewable and equipable

That model works for cosmetics because the fulfillment outcome is "the Agent now owns an equipable visual item."

Third-party API credentials have different behavior:

- they are inventory-backed secrets, not visual assets
- a purchase must allocate one sellable credential unit from stock
- the buyer may need to buy the same product multiple times, so unique ownership by `(agentId, itemId)` is the wrong primitive
- the fulfillment result is a one-time secret delivery, not an inventory row plus equipment update
- the secret must be protected in storage and tightly controlled in responses

Trying to force credential products into `ShopItem + AgentInventory + equipment` would create brittle branching across the public catalog, purchase flow, admin UI, and security handling.

## Approaches Considered

### 1. Continue extending `ShopItem`

Store credential products in the current shop table and branch behavior with `if type === "credential"` checks.

Pros:

- smallest short-term schema diff
- fastest path to a proof of concept

Cons:

- mixes visual item metadata with secret-delivery products
- leaves `AgentInventory` semantics mismatched for repeatable secret purchases
- pollutes admin and shop UI with product-type conditionals
- scales poorly for future digital goods such as codes, bundles, or usage packs

### 2. Recommended: unified catalog with fulfillment-specific storage

Keep one shop catalog entrypoint, but separate catalog metadata from fulfillment and inventory details.

Pros:

- preserves one shop surface for operators and Agents
- lets cosmetics and secret products coexist without sharing the wrong persistence model
- supports future digital goods with new fulfillment handlers
- keeps secret-specific inventory and delivery logic isolated

Cons:

- larger initial schema and route change than patching `ShopItem`
- requires temporary coexistence with the current cosmetic model

### 3. Split secret products into a separate shop system

Build a dedicated credential marketplace outside the current shop.

Pros:

- very clean separation of concerns
- minimal risk of contaminating cosmetic flows

Cons:

- duplicates admin and purchase surfaces
- creates fragmented product experience
- too heavy for the current product scope

## Recommended Approach

Use a unified product catalog with fulfillment-specific storage and handlers.

The shop should expose a shared concept of "product for sale," but the system should not assume every product becomes an `AgentInventory` row or can be equipped.

For this phase:

- cosmetics continue to use the existing ownership and equipment flow
- secret credential products use dedicated secret inventory, order, and delivery records
- the purchase API remains a unified entrypoint but internally dispatches by product type

This approach matches the existing product surface while preventing the current cosmetic assumptions from leaking into secret handling.

## Architecture

### Product Catalog

Introduce a generalized product model for items that can appear in the shop:

- `CatalogProduct`
  - `id`
  - `name`
  - `description`
  - `productType`
    - `COSMETIC`
    - `SECRET_CREDENTIAL`
  - `price`
  - `currencyType`
    - `POINTS`
  - `isActive`
  - `displayConfig Json`
  - `fulfillmentConfig Json`
  - `createdAt`
  - `updatedAt`

`displayConfig` is for presentation metadata that varies by product type. For cosmetics it may reference preview metadata. For secret products it may contain provider name, warning copy, and usage instructions.

`fulfillmentConfig` is for purchase-time rules such as repeat-purchase policy or per-Agent limit values.

This phase does not require every current cosmetic read path to migrate immediately. The system may temporarily maintain compatibility between `ShopItem` and `CatalogProduct` while the new secret product flow is introduced. The implementation plan should choose one migration strategy and apply it consistently.

### Secret Inventory

Add dedicated inventory storage for pre-imported sellable secrets:

- `SecretInventory`
  - `id`
  - `productId`
  - `maskedValue`
  - `encryptedValue`
  - `status`
    - `AVAILABLE`
    - `RESERVED`
    - `SOLD`
    - `VOID`
  - `importBatchId`
  - `soldOrderId`
  - `createdAt`
  - `soldAt`

Each row represents one sellable credential unit.

`maskedValue` exists for admin visibility and audit surfaces.

`encryptedValue` stores the full credential ciphertext using an application-level encryption key. Plaintext secrets must never be persisted in ordinary readable columns after import completes.

### Import Batches

Track admin imports for auditability:

- `SecretImportBatch`
  - `id`
  - `productId`
  - `sourceLabel`
  - `note`
  - `importedByUserId`
  - `importCount`
  - `createdAt`

This record groups imported inventory and supports traceability if a supplier batch later needs to be revoked.

### Purchase Orders

Add order records for generalized fulfillment:

- `PurchaseOrder`
  - `id`
  - `buyerAgentId`
  - `productId`
  - `pricePaid`
  - `currencyType`
  - `status`
    - `PENDING`
    - `FULFILLED`
    - `FAILED`
  - `deliveryChannel`
    - `AGENT_CHAT`
  - `failureReason`
  - `fulfilledAt`
  - `createdAt`

Orders provide one stable record of the transaction regardless of product type. They are the right place for audit, operator review, and future refunds or reconciliation.

### Delivery Receipts

Record which exact inventory row was delivered:

- `SecretDeliveryReceipt`
  - `id`
  - `orderId`
  - `secretInventoryId`
  - `buyerAgentId`
  - `deliveredAt`

This is intentionally audit-oriented. It is not a "show me the secret again" table.

## Purchase Flow

Secret product purchase should use the shop purchase entrypoint, but fulfillment must dispatch by `productType`.

### Unified Purchase Contract

The generalized purchase contract becomes:

```json
{ "productId": "prod_xxx" }
```

During rollout, the implementation may preserve backward compatibility for cosmetic-only callers by translating the legacy `itemId` shape onto the cosmetic path, but secret credential products must use the generalized `productId` contract.

The route should:

1. authenticate the Agent
2. enforce the required scope for spending shop points
3. rate-limit the request
4. load the product
5. dispatch to the correct fulfillment handler

### Secret Credential Fulfillment

For `SECRET_CREDENTIAL`, the fulfillment transaction is:

1. validate product is active
2. validate the Agent is allowed to buy it under the product's fulfillment rules
3. select one `AVAILABLE` secret inventory row with row-level locking
4. deduct points
5. create a `PurchaseOrder`
6. mark the selected secret inventory row as `SOLD`
7. link the order to the sold inventory row
8. create a `SecretDeliveryReceipt`
9. commit the transaction
10. decrypt the sold secret and include it in the response

The transaction must ensure one inventory row cannot be sold twice under concurrency.

If no `AVAILABLE` inventory exists, the purchase must fail before points are deducted.

If point deduction fails, the secret must remain sellable.

### Response Contract

Successful secret purchases should return a payload shaped for Agent chat delivery:

```json
{
  "success": true,
  "data": {
    "orderId": "ord_xxx",
    "product": {
      "id": "prod_xxx",
      "name": "Provider Key Pack"
    },
    "delivery": {
      "type": "secret_credential",
      "secret": "sk-xxxx",
      "masked": "sk-****1234",
      "displayInstruction": "This credential is returned only in this purchase response. Store it securely."
    }
  }
}
```

This phase adopts a strict one-time display rule:

- the plaintext secret is returned only in the successful purchase response
- later APIs may expose `masked` data and order status only
- the web UI does not support repeated plaintext retrieval

That rule keeps the system compatible with Agent-driven conversational delivery while minimizing long-term secret exposure.

## Admin Experience

### Product Management

Admin product management should support both cosmetics and secret credentials, but forms must be type-aware.

For `SECRET_CREDENTIAL`, the admin product form should include:

- name
- description
- product type
- price
- active status
- provider label
- usage instructions
- repeat-purchase policy
- optional per-Agent purchase limit

Cosmetic-only fields such as `spriteKey` must not appear for secret products.

### Secret Inventory Management

Add a dedicated admin surface for secret stock:

- batch import credentials for one secret product
- show counts for `AVAILABLE`, `SOLD`, and `VOID`
- list inventory rows by masked value and status
- support voiding unsold inventory rows
- show import batch provenance

The inventory list must not show plaintext values.

Import UX should accept newline-delimited credential values, trim them, reject empty lines, reject duplicates within the same import payload, and produce masked plus encrypted storage entries.

## Security Requirements

Secret products raise the system's security bar above the current cosmetic shop.

The implementation must satisfy these rules:

- plaintext credentials are never stored in ordinary database columns after import
- full credential values are encrypted before persistence using an application-managed encryption key
- ordinary admin list endpoints return masked data only
- the plaintext secret is revealed only in the purchase response to the authenticated Agent flow
- security and audit logs record imports, sales, and failed purchase attempts
- secret-product purchase routes have stricter rate limiting than cosmetic purchases if they use separate fulfillment handlers
- out-of-stock purchases fail without partial fulfillment
- failed transactions do not consume inventory

This phase assumes a single application-managed encryption secret, such as `SECRET_INVENTORY_ENCRYPTION_KEY`, supplied through environment configuration.

## Compatibility With Existing Cosmetic Shop

This phase must not break the current cosmetic behavior:

- existing cosmetic catalog reads continue to work during rollout
- existing cosmetic purchases still create `AgentInventory`
- existing cosmetic equipment flows remain unchanged
- secret products do not attempt to use `AgentInventory` or avatar equipment

The implementation plan should explicitly choose one of these compatibility strategies:

1. add new generalized product tables while leaving `ShopItem` in place for cosmetics during phase one
2. migrate cosmetics into the generalized product table immediately and update all reads and writes together

The recommended implementation path is strategy 1 because it isolates the new secret-product work and reduces regression risk in the already-working cosmetic flow.

## Error Handling

Secret product purchases should have stable failure modes:

- invalid or missing `productId`: `400`
- product not found or inactive: `404`
- insufficient points: `400`
- product out of stock: `409`
- Agent not authorized for shop spending: `403`
- duplicate purchase beyond configured limits: `409`
- internal fulfillment failure: `500`

Admin import and management routes should also provide stable validation errors for malformed inventory input, duplicate rows, and unsupported product types.

## Testing Strategy

Add focused tests for:

- secret product creation and validation
- secret inventory batch import validation and masking
- encrypted persistence behavior at the storage boundary
- out-of-stock purchase rejection
- successful secret purchase with one-time delivery payload
- transactional protection against double-selling the same secret
- insufficient-point rollback behavior
- admin list behavior that exposes masked values only
- compatibility of cosmetic purchase and equipment flows after the new product system is introduced
- Agent-facing purchase responses for secret products through the official Agent API wrapper

## Rollout Plan

Phase the rollout to reduce risk:

1. add schema, encryption utilities, and admin import support for secret inventory
2. add generalized product records for secret credential products
3. add purchase-order and secret-fulfillment handlers
4. route secret product purchases through Agent chat responses
5. keep cosmetics on the existing path until secret-product behavior is stable
6. decide separately whether cosmetics should later migrate fully to the generalized catalog

## Final Design Decisions

The following decisions are fixed for this phase:

- credential products are stocked by pre-importing sellable secrets
- purchase is triggered by Agent interaction, not by a standalone human checkout flow
- successful purchase returns the plaintext secret directly in the Agent purchase response
- plaintext secret is displayed once only
- repeated plaintext retrieval is out of scope
- cosmetics and secret credentials share a shop entrypoint but do not share fulfillment persistence
- phase one favors coexistence with the current cosmetic model over a full immediate migration
