# Shop Secret Credential Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve secret credential products from a usable Agent-only purchase path into a complete shop capability with unified discovery, stronger admin operations, better inventory integrity, and buyer-facing traceability.

**Architecture:** Keep the existing parallel product model for `SECRET_CREDENTIAL` products instead of forcing an early merge into the legacy `shopItem` cosmetic stack. Phase 1 focuses on closing operational and contract gaps around the current architecture. Phase 2 adds unified storefront experience, post-purchase history, and stronger reservation/risk-control behavior on top of the same product/order/inventory tables.

**Tech Stack:** Next.js App Router, Prisma, PostgreSQL, React client components, existing admin auth/rate-limit/request-security helpers, Node test runner

---

## Current Gaps

- Secret products are returned only from the Agent shop API, while the web shop page still renders only legacy cosmetics.
- Admin UI supports create and import, but not edit, activate/deactivate, inventory detail browsing, or void operations even though part of the backend already exists.
- Admin summary counts total inventory rows instead of sellable inventory, which hides real stock status.
- Backend supports `perAgentPurchaseLimit`, but the current admin form/client cannot configure it.
- Inventory import deduplicates only within a single pasted batch, not across prior imports.
- Orders and delivery receipts exist in the data model, but there is no buyer/admin history view for audit or support.

## Phase Strategy

### Phase 1

Ship the minimum complete operating model:

- unified secret-product metadata contract for shop consumers
- admin editing, activation, inventory visibility, and void controls
- accurate sellable stock reporting
- configurable repeat/limit rules in admin
- cross-batch duplicate protection and better operational tests

### Phase 2

Extend the system into a first-class product surface:

- unified web storefront exposure
- buyer purchase history and masked delivery audit
- stronger reservation/retry semantics
- analytics, low-stock awareness, and richer support tooling

---

### Task 1: Phase 1 Shop Contract Hardening

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/api/agent/shop/route.ts`
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.ts`
- Modify: `/Volumes/T7/Code/Evory/src/lib/agent-public-documents.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/agent/agent-read-api.test.ts`
- Test: `/Volumes/T7/Code/Evory/src/lib/shop-client.test.ts`

- [ ] Add a stable secret-product response shape that includes at least `usageInstructions`, `allowRepeatPurchase`, `perAgentPurchaseLimit`, `availableInventoryCount`, and an explicit `isInStock` boolean.
- [ ] Keep the existing `cosmetics` and `secretProducts` split in the Agent API for Phase 1 so there is no forced migration of current cosmetic callers.
- [ ] Update the shop client types so admin and Agent consumers share the same secret-product envelope instead of untyped `Record<string, unknown>`.
- [ ] Update the public Agent API docs to reflect the richer secret-product payload and clarify that stock/limit fields are advisory and purchase remains authoritative.
- [ ] Add tests that verify the Agent shop endpoint returns the new fields and that the client parses them correctly.

**Phase 1 acceptance criteria**

- Agent consumers can determine whether a secret product is purchasable before submitting a purchase.
- API docs and TypeScript client types match the runtime response.
- Existing cosmetic shop consumers remain unchanged.

### Task 2: Phase 1 Admin Product Operations

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/app/admin/page.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.ts`
- Modify: `/Volumes/T7/Code/Evory/src/i18n/zh.ts`
- Modify: `/Volumes/T7/Code/Evory/src/i18n/en.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.test.tsx`

- [ ] Add edit mode for secret products using the existing `PUT /api/admin/shop/products/[id]` route.
- [ ] Add activate/deactivate controls in the admin panel so secret products can be taken off sale without deleting inventory.
- [ ] Expose `perAgentPurchaseLimit` in the admin form, including clear UI rules for “unlimited” vs positive integer limit.
- [ ] Show product-level badges for `active/inactive`, `repeat allowed/blocked`, and low-stock state.
- [ ] Keep create/edit payload construction inside the shop client so UI code does not duplicate request-shape logic.
- [ ] Add panel tests for edit flows, limit field handling, and activation state transitions.

**Phase 1 acceptance criteria**

- Admin can create, edit, activate, and deactivate secret products from the UI.
- Admin can configure both repeat-purchase behavior and per-agent purchase limit without using manual API calls.
- Product cards show enough state to support normal catalog operations.

### Task 3: Phase 1 Inventory Visibility And Integrity

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/route.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/[id]/inventory/route.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/inventory/[inventoryId]/void/route.ts`
- Modify: `/Volumes/T7/Code/Evory/src/lib/admin-secret-products.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.tsx`
- Test: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/route.test.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/[id]/inventory/route.test.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/inventory/[inventoryId]/void/route.test.ts`

- [ ] Change product summary counts to expose `availableInventoryCount`, `soldInventoryCount`, and `voidInventoryCount` instead of a single ambiguous total.
- [ ] Add inventory-detail retrieval for a selected product, returning masked values, status, import batch metadata, and timestamps only.
- [ ] Wire a void action into the admin UI for `AVAILABLE` inventory rows.
- [ ] Add cross-batch duplicate detection during import. At minimum, reject exact duplicate plaintext secrets for the same product before insert.
- [ ] Preserve current encryption-at-rest behavior and never return plaintext inventory in admin APIs.
- [ ] Add tests for duplicate rejection, status-specific counts, and void behavior from the admin panel.

**Phase 1 acceptance criteria**

- Admin can see how much stock is actually sellable.
- Admin can inspect and void individual unsold inventory rows without database access.
- Import rejects duplicate secrets that would otherwise create double-sell risk.

### Task 4: Phase 1 Purchase Reliability And Ops Observability

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/lib/secret-product-fulfillment.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/api/points/shop/purchase/route.ts`
- Test: `/Volumes/T7/Code/Evory/src/lib/secret-product-fulfillment.test.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/points/shop/shop-workflow.test.ts`

- [ ] Keep the existing serializable transaction and retry loop, but return a distinct, documented retryable error code/message for exhausted transaction conflicts.
- [ ] Emit structured logs for out-of-stock, purchase-limit rejection, duplicate import rejection, and conflict exhaustion so operators can distinguish business failures from platform failures.
- [ ] Ensure product-level stock metadata used by shop-list endpoints is derived from `AVAILABLE` rows only.
- [ ] Add regression tests for low-stock edge cases, retry exhaustion, limit enforcement, and purchase responses after inventory voids.

**Phase 1 acceptance criteria**

- Buyers receive clearer purchase failure categories.
- Operators can identify whether incidents are caused by inventory depletion, policy rejection, or transaction contention.
- Phase 1 closes the main “can we run this in production” gaps without changing the current table model.

---

### Task 5: Phase 2 Unified Storefront Experience

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/shop/page.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/components/shop/*`
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/api/points/shop/route.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/shop/page.test.tsx`
- Test: `/Volumes/T7/Code/Evory/src/components/shop/*.test.tsx`

- [ ] Design a unified storefront model that can render cosmetics and secret products in one page while preserving product-type-specific actions.
- [ ] Introduce a secret-product card/drawer treatment that clearly communicates “instant delivery, not equipable, one-time visible secret”.
- [ ] Decide whether the public web shop should remain read-only or allow authenticated human purchase flows; do not expand scope beyond visibility unless explicitly approved.
- [ ] Add filtering/sorting support that works across both product families.
- [ ] Add UI tests for mixed catalogs, empty-state behavior, and product-type-specific detail drawers.

**Phase 2 acceptance criteria**

- Users can discover secret products from the same storefront context as cosmetics.
- The UI makes the fulfillment difference obvious before purchase.
- The storefront remains coherent even with mixed product types.

### Task 6: Phase 2 Order History And Delivery Audit

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/route.ts`
- Create: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/orders/route.ts`
- Create: `/Volumes/T7/Code/Evory/src/app/api/agent/shop/orders/route.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.tsx`
- Modify: `/Volumes/T7/Code/Evory/src/lib/shop-client.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/orders/route.test.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/agent/shop/orders/route.test.ts`

- [ ] Add admin order-history retrieval with product, buyer, masked credential, delivery receipt, and purchase timestamps.
- [ ] Add Agent-side purchase history with masked-only delivery details so buyers can confirm what they bought without re-exposing plaintext credentials.
- [ ] Keep plaintext secret delivery limited to the original purchase response.
- [ ] Add list filtering by product, buyer, and status to support support/debugging workflows.

**Phase 2 acceptance criteria**

- Support/admin can trace who bought what and when using masked data only.
- Buyers can verify previous purchases without weakening secret-exposure guarantees.
- The system remains compliant with the “plaintext shown only once” rule.

### Task 7: Phase 2 Reservation And Concurrency Model Upgrade

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/lib/secret-product-fulfillment.ts`
- Modify: `/Volumes/T7/Code/Evory/prisma/schema.prisma`
- Create or Modify: `/Volumes/T7/Code/Evory/prisma/migrations/*secret-reservation*`
- Test: `/Volumes/T7/Code/Evory/src/lib/secret-product-fulfillment.test.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/points/shop/shop-workflow.test.ts`

- [ ] Re-evaluate the currently unused `RESERVED` state and decide whether a short-lived reservation stage reduces contention or unlocks future human checkout flows.
- [ ] If adopted, add expiry/cleanup semantics for stale reservations and keep purchase finalization idempotent.
- [ ] Preserve backward compatibility for already sold inventory and existing receipts.
- [ ] Add high-contention tests to compare the current direct-sell path against the reservation path before rollout.

**Phase 2 acceptance criteria**

- The concurrency model is intentionally simple or intentionally upgraded, but no longer half-prepared.
- Reservation behavior, if added, has explicit timeout and cleanup rules.
- Purchase finalization remains safe under contention.

### Task 8: Phase 2 Stock Awareness And Commercial Analytics

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/products/route.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/admin/admin-secret-products-panel.tsx`
- Create: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/metrics/route.ts`
- Test: `/Volumes/T7/Code/Evory/src/app/api/admin/shop/metrics/route.test.ts`

- [ ] Add low-stock thresholds and warnings to the admin panel.
- [ ] Add sell-through, import batch, and purchase conversion metrics for secret products.
- [ ] Surface “inventory exhausted”, “inventory duplicated on import attempt”, and “limit-rejected purchases” as operator-facing counters where useful.
- [ ] Keep Phase 2 analytics additive; do not block core shop operations on metrics collection.

**Phase 2 acceptance criteria**

- Admin can identify which products are near depletion and which products are actually moving.
- Operators can spot supply and policy issues without querying the database directly.
- Metrics do not become a hard dependency for purchasing.

---

## Delivery Order

1. Phase 1 Task 1: Shop contract hardening
2. Phase 1 Task 2: Admin product operations
3. Phase 1 Task 3: Inventory visibility and integrity
4. Phase 1 Task 4: Purchase reliability and observability
5. Phase 2 Task 5: Unified storefront experience
6. Phase 2 Task 6: Order history and delivery audit
7. Phase 2 Task 7: Reservation and concurrency model upgrade
8. Phase 2 Task 8: Stock awareness and analytics

## Milestone Definition

### Phase 1 done

- Secret products are operable without direct database intervention.
- Shop consumers have enough metadata to avoid blind purchase attempts.
- Inventory accuracy and duplicate-import risk are materially improved.

### Phase 2 done

- Secret products behave like a first-class catalog surface instead of a special Agent-only branch.
- Buyers and admins have masked audit/history views.
- Inventory lifecycle, storefront exposure, and operational metrics are complete enough for broader scaling.

## Risks And Constraints

- Do not leak plaintext secrets outside the purchase success response.
- Do not break the legacy cosmetic `shopItem` flow while iterating on secret products.
- Be careful with migrations around inventory status semantics because sold rows already depend on current constraints.
- Avoid a premature full unification of `shopItem` and `catalogProduct`; Phase 1 should optimize the existing split, not rebuild the catalog model.
