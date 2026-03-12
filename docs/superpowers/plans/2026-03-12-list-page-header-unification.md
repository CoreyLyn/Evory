# List Page Header Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the list-page header treatment across forum, tasks, shop, and agents with one shared title-and-description component and page-specific right-side support content.

**Architecture:** Add a narrow shared `PageHeader` layout component under the existing layout primitives, then migrate the four in-scope list pages to it without changing their body content. Lock the component contract with a focused render test, then update page-level tests and translations so the new agents subtitle and shared header usage are covered by regression checks.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind utility classes, local i18n dictionaries, Node test runner with `tsx`

---

## Chunk 1: Add The Shared Header Primitive

### Task 1: Write the failing shared-header render test

**Files:**
- Create: `src/components/layout/page-header.test.tsx`
- Test: `src/components/layout/page-header.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a focused render test for `PageHeader` that asserts:
- the title renders in an `h1`
- the description renders beneath the title
- the right-side container renders when `rightSlot` is provided
- no empty right-side container renders when `rightSlot` is omitted

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --import tsx --test src/components/layout/page-header.test.tsx`
Expected: FAIL because `src/components/layout/page-header.tsx` does not exist yet

### Task 2: Implement the shared `PageHeader` component

**Files:**
- Create: `src/components/layout/page-header.tsx`
- Test: `src/components/layout/page-header.test.tsx`

- [ ] **Step 1: Write the minimal implementation**

Create `PageHeader` with this contract:
- required `title`
- required `description`
- optional `rightSlot`

Render:
- a root wrapper using `mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between`
- a left text block using `space-y-1.5`
- an `h1` using `font-display text-2xl font-bold tracking-tight text-foreground`
- a description paragraph using `mt-1.5 max-w-2xl text-sm text-muted`
- a right-slot wrapper only when `rightSlot` is passed

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `node --import tsx --test src/components/layout/page-header.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit the primitive**

```bash
git add src/components/layout/page-header.tsx src/components/layout/page-header.test.tsx
git commit -m "feat: add shared list page header"
```

## Chunk 2: Migrate In-Scope Pages And Copy

### Task 3: Add failing page-level coverage for the unified headers

**Files:**
- Create: `src/app/agents/page.test.tsx`
- Modify: `src/app/read-only-page-shells.test.tsx`
- Modify: `src/app/shop/page.test.tsx`
- Test: `src/app/agents/page.test.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/shop/page.test.tsx`

- [ ] **Step 1: Update the existing read-only shell test**

Keep the current forum, tasks, and shop copy checks, and add assertions that each page still renders its route-specific title and read-only description after the shared header extraction.

- [ ] **Step 2: Add a new agents page test**

Render `src/app/agents/page.tsx` inside `LocaleProvider` and assert:
- `agents.title` appears
- the exact zh subtitle `这里展示公开 Agent 档案、状态与积分概览，方便快速浏览整个目录。` appears
- `agents.sortedByPoints` appears in the header output

- [ ] **Step 3: Extend the shop page test with header coverage**

Add a full-page render assertion for `ShopPage` that verifies the page header still renders:
- `shop.title`
- `control.shopReadOnly`
- `shop.balance`

- [ ] **Step 4: Run the page-level tests to verify they fail**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/agents/page.test.tsx src/app/shop/page.test.tsx`
Expected: FAIL because the agents subtitle does not exist and the pages have not been migrated to the shared header yet

### Task 4: Add the new agents subtitle translations

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/agents/page.test.tsx`

- [ ] **Step 1: Add the new translation keys**

Add:
- `agents.subtitle` in `src/i18n/zh.ts` with `这里展示公开 Agent 档案、状态与积分概览，方便快速浏览整个目录。`
- `agents.subtitle` in `src/i18n/en.ts` with `Browse public agent profiles, live status, and point totals from the directory.`

- [ ] **Step 2: Re-run the page-level tests**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/agents/page.test.tsx src/app/shop/page.test.tsx`
Expected: still FAIL because the page components are not using the shared header yet

### Task 5: Migrate the four list pages to `PageHeader`

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/shop/page.tsx`
- Modify: `src/app/agents/page.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/agents/page.test.tsx`
- Test: `src/app/shop/page.test.tsx`

- [ ] **Step 1: Update the forum page**

Replace the inline forum title block with `PageHeader` using `title={t("forum.title")}` and `description={t("control.forumReadOnly")}`.

- [ ] **Step 2: Update the tasks page**

Replace the inline tasks title block with `PageHeader` using `title={t("tasks.title")}` and `description={t("control.tasksReadOnly")}`.

Keep all filter controls, cards, loading states, and pagination logic unchanged in both pages.

- [ ] **Step 3: Update the shop page**

Replace the left-side title block with `PageHeader` and pass the existing balance card through `rightSlot`. Keep the card markup and loading behavior unchanged.

- [ ] **Step 4: Update the agents page**

Replace the current header row with `PageHeader`:
- `title={t("agents.title")}`
- `description={t("agents.subtitle")}`
- `rightSlot` renders the current `t("agents.sortedByPoints")` hint

Keep the grid, sorting behavior, loading state, and pagination unchanged.

- [ ] **Step 5: Run the page-level tests to verify they pass**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/agents/page.test.tsx src/app/shop/page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the page migration**

```bash
git add src/app/forum/page.tsx src/app/tasks/page.tsx src/app/shop/page.tsx src/app/agents/page.tsx src/app/read-only-page-shells.test.tsx src/app/agents/page.test.tsx src/app/shop/page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: unify list page headers"
```

## Chunk 3: Run Regression Verification

### Task 6: Run the focused list-page regression tests

**Files:**
- Test: `src/components/layout/page-header.test.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/agents/page.test.tsx`
- Test: `src/app/shop/page.test.tsx`

- [ ] **Step 1: Run the focused regression suite**

Run: `node --import tsx --test src/components/layout/page-header.test.tsx src/app/read-only-page-shells.test.tsx src/app/agents/page.test.tsx src/app/shop/page.test.tsx`
Expected: PASS

### Task 7: Run the broader project test suite

**Files:**
- Test: project test suite

- [ ] **Step 1: Run the broader suite**

Run: `npm test`
Expected: PASS with zero failures

- [ ] **Step 2: If `npm test` fails, triage before continuing**

If the suite fails:
- fix regressions introduced by the header unification work
- rerun `npm test`
- if the remaining failures are clearly unrelated or pre-existing, stop and report them instead of making unrelated fixes in this plan

- [ ] **Step 3: Commit the verified state only if Task 7 required additional fixes**

```bash
git add -A
git commit -m "test: verify unified list page headers"
```

Expected: skip this step when `npm test` passes cleanly without any follow-up code changes
