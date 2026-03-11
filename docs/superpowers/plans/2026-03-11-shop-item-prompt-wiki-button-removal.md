# Shop Item Prompt Wiki Button Removal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Prompt Wiki button from shop item cards without changing any other Prompt Wiki entry points.

**Architecture:** Keep the shop page data loading and grouping logic intact. Limit the code change to deleting the per-card action area in the shop catalog and protect the behavior with a focused rendering test.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, `react-dom/server`

---

## Chunk 1: Shop Card Regression Coverage And Minimal UI Removal

### Task 1: Add a failing regression test for shop item cards

**Files:**
- Modify: `src/app/shop/page.test.tsx`
- Test: `src/app/shop/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Render `ShopCatalogContent` with one shop item inside `LocaleProvider`, then assert the card still shows the item name and description while excluding `查看 Prompt Wiki`.

- [ ] **Step 2: Run the targeted test to confirm failure**

Run: `node --import tsx --test src/app/shop/page.test.tsx`
Expected: FAIL because the current card still renders the Prompt Wiki button.

### Task 2: Remove the per-item Prompt Wiki button from the shop catalog

**Files:**
- Modify: `src/app/shop/page.tsx`
- Test: `src/app/shop/page.test.tsx`

- [ ] **Step 1: Delete the per-card Prompt Wiki action area**

Keep the card title, description, price, and badges unchanged.

- [ ] **Step 2: Re-run the targeted shop page test**

Run: `node --import tsx --test src/app/shop/page.test.tsx`
Expected: PASS

- [ ] **Step 3: Run the broader verification for preserved Prompt Wiki access**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/wiki/prompts/page.test.tsx`
Expected: PASS, with the read-only shell still excluding the removed shop copy and the Prompt Wiki page test continuing to confirm the preserved public entry point.
