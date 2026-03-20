# Agent Copyable Command Block Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/settings/agents` troubleshooting command block use the same copyable code-block control as prompt wiki, while keeping `BASE_URL` sourced from `NEXT_PUBLIC_SITE_URL`.

**Architecture:** Extract a shared `CopyableCodeBlock` UI component that wraps the existing `CopyButton` interaction and common code-panel chrome. Reuse it in both prompt wiki and the Agents troubleshooting card so the visual structure and behavior stay aligned.

**Tech Stack:** Next.js App Router, React, TypeScript, existing node:test render tests

---

### Task 1: Lock the shared command-block contract with tests

**Files:**
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add assertions that:
- Agents troubleshooting renders a copy button on the local doctor command block
- Prompt wiki still renders the copyable command block
- `NEXT_PUBLIC_SITE_URL` is reflected in prompt wiki output

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test src/app/settings/agents/page.test.tsx --test src/app/wiki/prompts/page.test.tsx`
Expected: FAIL because `/settings/agents` does not yet use the shared copyable block

### Task 2: Implement the shared copyable code block

**Files:**
- Create: `src/components/ui/copyable-code-block.tsx`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `src/components/wiki/prompt-gallery.tsx`

- [ ] **Step 1: Write the minimal shared component**

Extract the code-panel wrapper, copy-button positioning, and `<pre>` styling into a reusable component that takes the rendered text and optional style overrides.

- [ ] **Step 2: Reuse it from both pages**

Replace the ad-hoc prompt wiki code panel and the Agents troubleshooting command `<pre>` with the shared component, preserving current text content and `siteUrl` wiring.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test -- --test src/app/settings/agents/page.test.tsx --test src/app/wiki/prompts/page.test.tsx`
Expected: PASS
