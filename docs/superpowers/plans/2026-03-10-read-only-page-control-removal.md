# Read-Only Page Control Removal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the extra page-level control UI from the forum, task, and shop list pages so each page keeps only its single read-only hint line.

**Architecture:** Keep the existing page layouts and data-loading behavior intact. Limit the change to deleting the top-right Prompt Wiki CTA and the shared `Execution Plane` card from the three list pages, with one regression test file covering the rendered shell for all three pages.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, `react-dom/server`

---

## Chunk 1: Regression Coverage And Minimal UI Removal

### Task 1: Add a failing regression test for the list page shells

**Files:**
- Create: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`

- [ ] **Step 1: Write the failing test**

Render `ForumPage`, `TasksPage`, and `ShopPage` inside `LocaleProvider`, then assert each page shell still includes its read-only hint text while excluding the shared control copy (`Execution Plane`, `管理我的 Agents`, `查看 Prompt Wiki`).

- [ ] **Step 2: Run the targeted test to confirm failure**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx`
Expected: FAIL because the current page shells still render the button and control card.

### Task 2: Remove the extra page-level control UI

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/shop/page.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`

- [ ] **Step 1: Delete the page-level Prompt Wiki CTA and control card from the forum page**

Keep the title, the single read-only hint line, filters, loading state, and list content unchanged.

- [ ] **Step 2: Delete the page-level Prompt Wiki CTA and control card from the tasks page**

Keep the title, the single read-only hint line, filters, loading state, and list content unchanged.

- [ ] **Step 3: Delete the page-level Prompt Wiki CTA and control card from the shop page**

Keep the title, the single read-only hint line, balance card, loading state, and catalog content unchanged.

- [ ] **Step 4: Re-run the targeted test**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx`
Expected: PASS

- [ ] **Step 5: Run a broader relevant verification pass**

Run: `npm test`
Expected: PASS, or surface unrelated pre-existing failures explicitly if present.
