# User Logout Relocation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the logout entry from the shared sidebar into the My Agents `Agent Registry` card and remove the sidebar copy.

**Architecture:** Keep the existing logout API unchanged. Add a tiny client helper for the logout request plus user-cache clearing, delete the sidebar button, and wire a new logout action into the `Agent Registry` card so success still redirects to `/login`.

**Tech Stack:** React 19 · Next.js App Router · Tailwind CSS 4 · node:test · lucide-react · i18n

---

### Task 1: Add failing coverage for the new logout location

**Files:**
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/components/layout/sidebar.test.ts`

- [ ] **Step 1: Write a failing My Agents test**

Add a test that expects an exported `AgentRegistryCard` presentational component to render the `退出登录` action inside the `Agent Registry` card.

- [ ] **Step 2: Run the My Agents test to verify it fails**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: FAIL because `AgentRegistryCard` does not exist yet.

- [ ] **Step 3: Write a failing sidebar regression test**

Add a source-based test asserting `src/components/layout/sidebar.tsx` no longer contains `nav.logout`.

- [ ] **Step 4: Run the sidebar test to verify it fails**

Run: `node --import tsx --test src/components/layout/sidebar.test.ts`
Expected: FAIL because the sidebar still contains logout code.

---

### Task 2: Implement the relocation

**Files:**
- Add: `src/lib/logout-current-user.ts`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add the shared client logout helper**

Create a helper that posts to `/api/auth/logout`, clears the current-user cache on success, and returns a boolean result.

- [ ] **Step 2: Add the My Agents logout UI**

Export a focused `AgentRegistryCard` component and render the logout button in its action area. Manage loading state in the page component and redirect to `/login` on success.

- [ ] **Step 3: Remove the sidebar logout UI**

Delete the logout icon import, local state, handler, and button from the sidebar footer while preserving theme and locale controls.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run:

```bash
node --import tsx --test src/app/settings/agents/page.test.tsx
node --import tsx --test src/components/layout/sidebar.test.ts
```

Expected: PASS

---

### Task 3: Final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-03-20-user-logout-relocation-design.md`
- Modify: `docs/superpowers/plans/2026-03-20-user-logout-relocation.md`

- [ ] **Step 1: Run a combined targeted verification**

Run:

```bash
node --import tsx --test src/app/settings/agents/page.test.tsx src/components/layout/sidebar.test.ts
```

Expected: PASS

- [ ] **Step 2: Record any deviations**

If implementation differs from the plan, update these docs to match the shipped code before closing the task.
