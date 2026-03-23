# Forum Remove Public Tag Filter UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep forum tags as lightweight display metadata for human readers while removing public tag-filter entry points and unused front-end filter state.

**Architecture:** Limit changes to the web forum presentation layer. Preserve server-side tag extraction and Agent/API retrieval semantics, but stop the public UI from carrying dedicated tag-filter props/state or clickable tag-filter links.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node.js test runner

---

### Task 1: Lock the new public-forum behavior with tests

**Files:**
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`

- [ ] **Step 1: Write the failing detail-page assertions**

Update the detail-page test so it expects forum tags to remain visible but no longer link to `/forum?tags=...`.

- [ ] **Step 2: Run the targeted detail-page test and verify RED**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx`
Expected: FAIL because tag links still exist.

- [ ] **Step 3: Write the failing list-page assertions for leaner props/state**

Update the list-page test harness usage so `ForumPageBody` no longer requires public tag-filter props or callbacks.

- [ ] **Step 4: Run the targeted list-page test and verify RED**

Run: `node --import tsx --test src/app/forum-post-list-content.test.tsx`
Expected: FAIL because the component signature still requires removed props.

### Task 2: Remove public tag-filter wiring while preserving tag display

**Files:**
- Modify: `src/app/forum/forum-page-client.tsx`
- Modify: `src/app/forum/[id]/forum-post-page-client.tsx`

- [ ] **Step 1: Remove unused public tag-filter props/state from the forum list client**

Delete `availableTags`, `popularTags`, `activeTags`, and `onTagToggle` from the page-body contract and stop storing those values in client state.

- [ ] **Step 2: Keep hidden URL compatibility but not public UI controls**

Preserve existing `selectedTagSlugs` query behavior for compatibility, but keep it internal with no public control surface.

- [ ] **Step 3: Turn detail-page tags into informational badges**

Replace clickable tag links in the main post and discovery sections with non-link badge wrappers.

- [ ] **Step 4: Run the two targeted forum rendering tests and verify GREEN**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx src/app/forum-post-list-content.test.tsx`
Expected: PASS.

### Task 3: Verify the affected forum behavior stays intact

**Files:**
- No additional file changes expected

- [ ] **Step 1: Run the focused forum tests**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx src/app/forum-post-list-content.test.tsx src/app/forum-post-page-state.test.tsx src/app/read-only-page-shells.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run the shared forum query tests to confirm Agent/API semantics remain intact**

Run: `node --import tsx --test src/lib/forum-list-query.test.ts src/lib/forum-post-list-data.test.ts src/app/api/forum/posts/forum-hidden-filter.test.ts`
Expected: PASS.

- [ ] **Step 3: Summarize the unrelated pre-existing baseline failure separately**

Document that `src/app/wiki/prompts/page.test.tsx` was already failing in baseline and was not modified by this task.
