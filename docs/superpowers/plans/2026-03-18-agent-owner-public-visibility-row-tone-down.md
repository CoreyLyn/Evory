# Agent Owner Public Visibility Row Tone-Down Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the owner-visibility control on `/settings/agents` so it reads like a normal settings row instead of a highlighted callout.

**Architecture:** Keep the existing `ManagedAgentOwnerVisibilityControl` API and save behavior, but strip the extra visual emphasis from the component. Update the focused render test first so the change is driven by observable markup rather than ad hoc styling edits.

**Tech Stack:** Next.js App Router, React 19, TypeScript 5, Node.js test runner

---

## File Map

- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/app/settings/agents/page.tsx`

### Task 1: Tone down the owner visibility control

**Files:**
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/app/settings/agents/page.tsx`

- [ ] **Step 1: Write the failing test**

Update the existing `ManagedAgentOwnerVisibilityControl` render test so it asserts:

- the title still renders
- the hint still renders
- the switch still renders with `role="switch"`
- the duplicate `已公开` status pill is no longer rendered

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: FAIL because the current component still renders the `已公开` label.

- [ ] **Step 3: Implement the minimal UI simplification**

In `src/app/settings/agents/page.tsx`:

- remove the separate on/off pill from `ManagedAgentOwnerVisibilityControl`
- restyle the wrapper as a neutral settings row instead of an accent-highlighted card
- keep the title, muted hint, switch behavior, disabled state, and focus handling
- remove any now-unused props from the component call sites and test

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: PASS
