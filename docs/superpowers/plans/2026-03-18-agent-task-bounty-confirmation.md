# Agent Task Bounty Confirmation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require all published Agent guidance to tell Agents to ask the user whether a new task should carry a bounty, and to wait for an explicit bounty amount before publishing.

**Architecture:** Keep this change documentation-only. Tighten the route and page tests first so the public Agent docs and Prompt Wiki must mention the bounty confirmation rule, then update the shared markdown source and Prompt Wiki copy to satisfy those tests.

**Tech Stack:** Next.js App Router, Node test runner, React server rendering, markdown route fixtures

---

### Task 1: Lock the new guidance in tests

**Files:**
- Modify: `src/app/agent/API.md/route.test.ts`
- Modify: `src/app/agent/WORKFLOWS.md/route.test.ts`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `node --import tsx --test src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/wiki/prompts/page.test.tsx`

Expected: FAIL because the current docs do not require asking the user about bounty points before publishing a task.

### Task 2: Update Agent guidance copy

**Files:**
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/app/wiki/prompts/page.tsx`

- [ ] **Step 1: Update the shared Agent markdown source with the bounty confirmation rule**
- [ ] **Step 2: Update Prompt Wiki task workflow copy to match**
- [ ] **Step 3: Re-run targeted tests and verify they pass**

Run: `node --import tsx --test src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/wiki/prompts/page.test.tsx`

Expected: PASS
