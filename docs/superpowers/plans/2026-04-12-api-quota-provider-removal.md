# API Quota Provider Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove provider configuration and provider display from API quota products while keeping existing quota purchasing and fulfillment flows intact.

**Architecture:** Make `providerLabel` optional in admin quota-product parsing and request payloads, then remove provider controls and provider preview/list rendering from the admin panel. Keep storefront data compatible, but stop rendering provider details in quota-product cards and drawers.

**Tech Stack:** Next.js App Router, React, TypeScript, node:test, React DOM server rendering tests

---

### Task 1: Relax quota-product input and helper behavior

**Files:**
- Modify: `src/lib/admin-api-quota-products.ts`
- Modify: `src/lib/admin-api-quota-products.test.ts`
- Modify: `src/lib/shop-client.ts`
- Modify: `src/lib/shop-client.test.ts`
- Modify: `src/app/admin/api-quota-product-draft.ts`
- Modify: `src/app/admin/api-quota-product-draft.test.ts`

- [ ] **Step 1: Write failing tests for provider-optional payloads and provider-free preview helpers**
- [ ] **Step 2: Run the focused tests and confirm they fail for the old provider-required behavior**
- [ ] **Step 3: Make `providerLabel` optional in parsing and admin request payload builders**
- [ ] **Step 4: Remove provider-specific draft and preview behavior**
- [ ] **Step 5: Re-run the focused helper and client tests**

### Task 2: Remove provider controls and storefront rendering

**Files:**
- Modify: `src/app/admin/admin-secret-products-panel.tsx`
- Modify: `src/app/admin/admin-secret-products-panel.test.tsx`
- Modify: `src/components/shop/item-card.tsx`
- Modify: `src/components/shop/item-card.test.tsx`
- Modify: `src/components/shop/item-drawer.tsx`
- Modify: `src/components/shop/item-drawer.test.tsx`
- Modify: `src/app/api/admin/shop/products/route.test.ts`
- Modify: `src/app/api/admin/shop/products/[id]/route.test.ts`

- [ ] **Step 1: Write failing component and route tests for the provider-free admin/storefront UI**
- [ ] **Step 2: Run the focused test suite and confirm failures**
- [ ] **Step 3: Remove provider fields from admin form, summary, and preview rendering**
- [ ] **Step 4: Remove provider chips from storefront quota cards and drawers**
- [ ] **Step 5: Re-run all focused tests and verify they pass**
