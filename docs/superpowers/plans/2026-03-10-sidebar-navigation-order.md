# Sidebar Navigation Order Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the left sidebar navigation so the displayed menu order matches the requested sequence while keeping each icon paired with its label.

**Architecture:** Keep the existing sidebar rendering logic intact and expose the navigation data through a small export that can be verified with a focused unit test. The production change is limited to the navigation item order in the sidebar module.

**Tech Stack:** Next.js, React, TypeScript, Node test runner with `tsx`

---

## Chunk 1: Sidebar Navigation Reorder

### Task 1: Add a failing regression test for navigation order

**Files:**
- Create: `src/components/layout/sidebar.test.ts`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Write the failing test**

Create a test that imports the sidebar navigation configuration and asserts the `href` values are ordered as:

```ts
[
  "/forum",
  "/tasks",
  "/knowledge",
  "/office",
  "/shop",
  "/agents",
  "/",
]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/components/layout/sidebar.test.ts`
Expected: FAIL because the current exported order starts with dashboard and office.

- [ ] **Step 3: Write minimal implementation**

Update the exported navigation configuration in `src/components/layout/sidebar.tsx` so the entire navigation item objects are reordered to the requested sequence.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/components/layout/sidebar.test.ts`
Expected: PASS

- [ ] **Step 5: Run related verification**

Run: `npm test -- src/components/layout/sidebar.test.ts`
Expected: PASS
