# Main Page Header System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the header system across forum, tasks, knowledge, office, shop, agents, and dashboard using one shared `PageHeader` primitive with explicit `list` and `overview` variants.

**Architecture:** Evolve the existing `PageHeader` component into a two-variant header primitive rather than introducing parallel abstractions. Migrate the five list-style pages to the `list` variant with aligned left edges and complete subtitle coverage, then migrate office and dashboard to a shared `overview` variant while keeping cards, canvas, and lower-page layouts unchanged.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind utility classes, local i18n dictionaries, Node test runner with `tsx`

---

## Chunk 1: Extend The Shared Header Primitive

### Task 1: Add failing tests for `variant` behavior

**Files:**
- Modify: `src/components/layout/page-header.test.tsx`
- Test: `src/components/layout/page-header.test.tsx`

- [ ] **Step 1: Write failing tests for the `list` and `overview` variants**

Extend `page-header.test.tsx` to assert:
- the default or explicit `list` variant renders an observable `data-variant="list"` contract
- the `list` variant root container keeps the shared layout classes: `flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between`
- the `list` variant keeps the exact title/subtitle class contract: `text-2xl` title and `text-sm` subtitle
- the `overview` variant renders an observable `data-variant="overview"` contract
- the `overview` variant keeps the same shared layout container but uses the exact title/subtitle class contract: `text-3xl` title and `text-base` subtitle
- the right-slot wrapper renders only for accepted meaningful content and stays absent for boolean values

- [ ] **Step 2: Run the focused component test to verify it fails**

Run: `node --import tsx --test src/components/layout/page-header.test.tsx`
Expected: FAIL because `PageHeader` does not yet support `variant`

### Task 2: Implement `variant` support in `PageHeader`

**Files:**
- Modify: `src/components/layout/page-header.tsx`
- Test: `src/components/layout/page-header.test.tsx`

- [ ] **Step 1: Write the minimal implementation**

Update `PageHeader` so:
- it accepts `variant?: "list" | "overview"`
- `list` preserves the full current title/subtitle class contract
- `overview` defines its own full title/subtitle class contract using `text-3xl` / `text-base`
- the root layout and breakpoint classes stay shared across both variants
- the root element exposes an observable variant marker such as `data-variant`
- the right-slot rendering rules define and preserve the meaningful-content contract already enforced by the component tests

- [ ] **Step 2: Run the focused component test to verify it passes**

Run: `node --import tsx --test src/components/layout/page-header.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit the primitive update**

```bash
git add src/components/layout/page-header.tsx src/components/layout/page-header.test.tsx
git commit -m "feat: add page header variants"
```

## Chunk 2: Normalize The Five List Pages

### Task 3: Add failing tests for list-page coverage

**Files:**
- Modify: `src/app/read-only-page-shells.test.tsx`
- Modify: `src/app/shop/page.test.tsx`
- Modify: `src/app/agents/page.test.tsx`
- Modify: `src/app/knowledge/page.test.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/shop/page.test.tsx`
- Test: `src/app/agents/page.test.tsx`
- Test: `src/app/knowledge/page.test.tsx`

- [ ] **Step 1: Extend forum/tasks/shop assertions**

Update the existing tests so they continue to prove:
- forum renders its title and read-only subtitle
- tasks renders its title and read-only subtitle
- shop renders title, read-only subtitle, and balance summary
- forum, tasks, and shop each expose the shared list-header observable contract
Add a forum-specific assertion that the old header-specific narrow wrapper contract is gone, for example by proving the page no longer renders the former `max-w-4xl` header shell around the title block.

- [ ] **Step 2: Extend agents coverage**

Keep the current agents header assertions and ensure the page still renders:
- `agents.title`
- the zh subtitle copy
- `agents.sortedByPoints`
- the shared list-header observable contract

- [ ] **Step 3: Add knowledge page coverage**

Update `src/app/knowledge/page.test.tsx` to assert:
- `knowledge.title`
- the new zh subtitle copy
- the search form still renders in the header region
- the shared list-header observable contract

- [ ] **Step 4: Run the focused list-page tests to verify they fail**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/shop/page.test.tsx src/app/agents/page.test.tsx src/app/knowledge/page.test.tsx`
Expected: FAIL because knowledge has no subtitle and forum/knowledge are not fully aligned to the shared list variant yet

### Task 4: Add the new knowledge subtitle translations

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/knowledge/page.test.tsx`

- [ ] **Step 1: Add the `knowledge.subtitle` translation keys**

Add:
- `knowledge.subtitle` in `src/i18n/zh.ts` with `公开文章、经验总结与操作记录都汇总在这里，支持搜索与浏览。`
- `knowledge.subtitle` in `src/i18n/en.ts` with `Browse public articles, runbooks, and shared learnings from across the platform.`

- [ ] **Step 2: Re-run the focused list-page tests**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/shop/page.test.tsx src/app/agents/page.test.tsx src/app/knowledge/page.test.tsx`
Expected: still FAIL because the knowledge page and forum alignment have not been migrated yet

### Task 5: Migrate forum, tasks, knowledge, shop, and agents to the `list` variant

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/knowledge/page.tsx`
- Modify: `src/app/shop/page.tsx`
- Modify: `src/app/agents/page.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/shop/page.test.tsx`
- Test: `src/app/agents/page.test.tsx`
- Test: `src/app/knowledge/page.test.tsx`

- [ ] **Step 1: Update the forum page alignment**

Remove the narrower header alignment caused by the `max-w-4xl` shell so the title block aligns with the other list pages. Keep the forum cards and filters behavior unchanged.

- [ ] **Step 2: Keep tasks on the shared `list` variant**

Ensure `tasks/page.tsx` uses `PageHeader` with the `list` variant and keeps its current title/subtitle copy.

- [ ] **Step 3: Migrate knowledge to the shared `list` variant**

Update `knowledge/page.tsx` to:
- render `PageHeader`
- use `title={t("knowledge.title")}`
- use `description={t("knowledge.subtitle")}`
- place the existing search form into `rightSlot`

Keep the article grid, loading states, and pagination behavior unchanged.

- [ ] **Step 4: Keep shop and agents on the shared `list` variant**

Ensure:
- shop keeps the balance card in `rightSlot`
- agents keeps the sort hint in `rightSlot`
- both still use the list-page title/subtitle structure
- forum, tasks, knowledge, shop, and agents all expose the same shared `list` header marker or equivalent observable contract

- [ ] **Step 5: Run the focused list-page tests to verify they pass**

Run: `node --import tsx --test src/app/read-only-page-shells.test.tsx src/app/shop/page.test.tsx src/app/agents/page.test.tsx src/app/knowledge/page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit the list-page migration**

```bash
git add src/app/forum/page.tsx src/app/tasks/page.tsx src/app/knowledge/page.tsx src/app/shop/page.tsx src/app/agents/page.tsx src/app/read-only-page-shells.test.tsx src/app/shop/page.test.tsx src/app/agents/page.test.tsx src/app/knowledge/page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: unify list page header system"
```

## Chunk 3: Normalize The Overview Pages

### Task 6: Add failing tests for overview-page coverage

**Files:**
- Modify: `src/app/dashboard-page.test.tsx`
- Create: `src/app/office/page.test.tsx`
- Test: `src/app/dashboard-page.test.tsx`
- Test: `src/app/office/page.test.tsx`

- [ ] **Step 1: Extend dashboard coverage**

Add assertions that the dashboard header continues to render its title and subtitle and now exposes the same observable overview-header contract defined in Chunk 1, including the shared `data-variant="overview"` marker.

- [ ] **Step 2: Add office page coverage**

Create `src/app/office/page.test.tsx` to assert:
- `office.title`
- `office.subtitle`
- the office page exposes the same observable overview-header contract defined in Chunk 1, including the shared `data-variant="overview"` marker
- the office header uses the same overview title/subtitle styling contract as dashboard rather than a page-specific alternative treatment

- [ ] **Step 3: Run the focused overview tests to verify they fail**

Run: `node --import tsx --test src/app/dashboard-page.test.tsx src/app/office/page.test.tsx`
Expected: FAIL because office and dashboard are not yet normalized onto the shared overview variant

### Task 7: Migrate office and dashboard to the `overview` variant

**Files:**
- Modify: `src/app/office/page.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Test: `src/app/dashboard-page.test.tsx`
- Test: `src/app/office/page.test.tsx`

- [ ] **Step 1: Update office to `overview`**

Replace the current office title block with `PageHeader` using:
- `title={t("office.title")}`
- `description={t("office.subtitle")}`
- `variant="overview"`

Keep stats, legend, canvas, and all lower-page interactions outside the shared header unless a lightweight support element clearly belongs in `rightSlot`.
Ensure the office header adopts the same overview title/subtitle styling contract as dashboard, not a page-specific gradient or alternate color treatment.

- [ ] **Step 2: Update dashboard to `overview`**

Replace the current dashboard title block with `PageHeader` using:
- `title={t("dashboard.title")}`
- `description={t("dashboard.subtitle")}`
- `variant="overview"`

Keep stats cards, realtime sections, and lower-page layout unchanged.
Ensure the dashboard header exposes the same observable overview contract and title/subtitle styling contract as office.

- [ ] **Step 3: Run the focused overview tests to verify they pass**

Run: `node --import tsx --test src/app/dashboard-page.test.tsx src/app/office/page.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit the overview migration**

```bash
git add src/app/office/page.tsx src/app/dashboard/page.tsx src/app/dashboard-page.test.tsx src/app/office/page.test.tsx
git commit -m "feat: unify overview page headers"
```

## Chunk 4: Final Regression Verification

### Task 8: Run the focused regression suite

**Files:**
- Test: `src/components/layout/page-header.test.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`
- Test: `src/app/shop/page.test.tsx`
- Test: `src/app/agents/page.test.tsx`
- Test: `src/app/knowledge/page.test.tsx`
- Test: `src/app/dashboard-page.test.tsx`
- Test: `src/app/office/page.test.tsx`

- [ ] **Step 1: Run the focused regression suite**

Run: `node --import tsx --test src/components/layout/page-header.test.tsx src/app/read-only-page-shells.test.tsx src/app/shop/page.test.tsx src/app/agents/page.test.tsx src/app/knowledge/page.test.tsx src/app/dashboard-page.test.tsx src/app/office/page.test.tsx`
Expected: PASS

### Task 9: Run the broader project test suite

**Files:**
- Test: project test suite

- [ ] **Step 1: Run the broader suite**

Run: `npm test`
Expected: PASS with zero failures

- [ ] **Step 2: If `npm test` fails, triage before continuing**

If the suite fails:
- fix regressions introduced by this header-system work
- rerun `npm test`
- if remaining failures are clearly unrelated or environment-dependent, stop and report them instead of making unrelated fixes in this plan

- [ ] **Step 3: Commit the verified state only if Task 9 required additional fixes**

```bash
git add -A
git commit -m "test: verify main page header system"
```

Expected: skip this step when `npm test` passes cleanly without any follow-up code changes
