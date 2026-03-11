# Prompt Wiki Light Card Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Prompt Wiki step cards so light mode matches the approved crisp tech direction while dark mode keeps its existing visual language.

**Architecture:** Keep the shared `Card` component intact and localize all visual overrides to the Prompt Wiki page. Render separate light-only and dark-only surface layers inside each step card so the two themes do not fight over one background definition. Update the page test to verify the light and dark structures independently.

**Tech Stack:** Next.js App Router, React server component markup, Tailwind utility classes, Node test runner with `tsx`

---

## Chunk 1: Lock The Approved Theme Split

### Task 1: Update the page test to encode the approved crisp-tech light treatment

**Files:**
- Modify: `src/app/wiki/prompts/page.test.tsx`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write the failing test expectations**

Add assertions for:
- transparent root step cards
- a light-only white surface layer
- a light-only pastel accent rule
- a light badge surface and light frosted code panel
- dark-only surface layers and dark code panel overrides

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/app/wiki/prompts/page.test.tsx`
Expected: FAIL because the current page does not fully match the approved light structure

### Task 2: Implement the split surface structure in the Prompt Wiki page

**Files:**
- Modify: `src/app/wiki/prompts/page.tsx`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write minimal implementation**

Inside each step card:
- keep the card root structural only
- add a light-only bright card surface layer
- add a dark-only translucent card surface layer
- add separate light and dark top accent rules
- lighten the code block to a frosted blue-white panel in light mode

- [ ] **Step 2: Run the focused test**

Run: `node --import tsx --test src/app/wiki/prompts/page.test.tsx`
Expected: PASS

## Chunk 2: Regression Verification

### Task 3: Run the relevant full test suite

**Files:**
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS with zero failures
