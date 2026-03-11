# Node Agent Local Credential Store Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Node-only Evory Agent credential store that discovers local credentials, writes the canonical config file, and manages `pending_binding` / `bound` transitions.

**Architecture:** Add one focused library module and one focused test file. The module owns precedence, parsing, warnings, write restrictions, and canonical-file mutations; callers remain responsible for any remote API validation.

**Tech Stack:** TypeScript, Node `fs/promises`, Node test runner, existing repo test script

---

## Chunk 1: Tighten Existing Public Contract Gaps

### Task 1: Align Prompt Wiki with env override precedence

**Files:**
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write the failing test assertion**

Add a test assertion that Prompt Wiki explicitly mentions `EVORY_AGENT_API_KEY` precedence.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/app/wiki/prompts/page.test.tsx`
Expected: FAIL because the current page text does not explicitly state env override precedence.

- [ ] **Step 3: Make the minimal copy change**

Update the onboarding prompt or explanatory copy so it explicitly says `EVORY_AGENT_API_KEY` has highest precedence over file-based sources.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/app/wiki/prompts/page.test.tsx`
Expected: PASS

### Task 2: Lock the full persisted example shape in `SKILL.md`

**Files:**
- Modify: `src/app/SKILL.md/route.test.ts`

- [ ] **Step 1: Write the failing assertions**

Add explicit assertions for:
- `"apiKey"`
- `"bindingStatus": "pending_binding"`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/app/SKILL.md/route.test.ts`
Expected: FAIL if either field name is not asserted yet.

- [ ] **Step 3: Update the test only**

Do not change production text unless the test exposes a real mismatch.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/app/SKILL.md/route.test.ts`
Expected: PASS

## Chunk 2: Add the Node-Only Credential Store Tests

### Task 3: Create the test harness for credential discovery and writes

**Files:**
- Create: `src/lib/agent-local-credential.test.ts`
- Create: `src/lib/agent-local-credential.ts`

- [ ] **Step 1: Write the first failing discovery precedence test**

Cover: env override beats canonical file and fallbacks.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement the minimal module surface**

Create the module with exported type definitions and a stubbed `discoverAgentCredential`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: PASS for the first case only

### Task 4: Add the remaining failing discovery tests

**Files:**
- Modify: `src/lib/agent-local-credential.test.ts`
- Modify: `src/lib/agent-local-credential.ts`

- [ ] **Step 1: Add failing tests for**

- canonical file precedence
- `.env.local` fallback precedence
- `.evory/agent.json` fallback precedence
- no-source result
- warnings on invalid fallback content
- structured error on invalid canonical content

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: FAIL on the newly added cases

- [ ] **Step 3: Implement the minimal parsing and precedence logic**

Add path resolution, fallback parsing, warning collection, and canonical error classification.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: PASS

## Chunk 3: Add Canonical File Mutations

### Task 5: Add failing tests for save and promote

**Files:**
- Modify: `src/lib/agent-local-credential.test.ts`
- Modify: `src/lib/agent-local-credential.ts`

- [ ] **Step 1: Add failing tests for**

- `savePendingAgentCredential`
- `promoteAgentCredentialToBound`
- auto-created parent directory
- generated `updatedAt`

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: FAIL on write-path behaviors

- [ ] **Step 3: Implement minimal canonical write and promote logic**

Use temp-file-plus-rename semantics for writes.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: PASS

### Task 6: Add failing tests for replace and clear

**Files:**
- Modify: `src/lib/agent-local-credential.test.ts`
- Modify: `src/lib/agent-local-credential.ts`

- [ ] **Step 1: Add failing tests for**

- `replaceAgentCredential`
- `clearAgentCredential`
- identity mismatch rejection for promote, replace, and clear
- non-canonical results being non-writable

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: FAIL on the newly added mutation cases

- [ ] **Step 3: Implement minimal replace and clear logic**

Preserve `agentId`, refresh `updatedAt`, and reject mismatched identities.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: PASS

## Chunk 4: Final Verification

### Task 7: Run the full verification set for touched tests

**Files:**
- Test: `src/app/SKILL.md/route.test.ts`
- Test: `src/app/wiki/prompts/page.test.tsx`
- Test: `src/lib/agent-local-credential.test.ts`

- [ ] **Step 1: Run all touched tests directly**

Run: `node --import tsx --test src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx src/lib/agent-local-credential.test.ts`
Expected: PASS

- [ ] **Step 2: Run the repo test command as integration evidence**

Run: `npm test -- --test src/app/SKILL.md/route.test.ts --test src/app/wiki/prompts/page.test.tsx --test src/lib/agent-local-credential.test.ts`
Expected: exit 0
Note: this repo's `npm test` script expands all `src/**/*.test.ts(x)` first, so this command currently exercises the full suite rather than a truly scoped subset.

- [ ] **Step 3: Review the diff for scope control**

Run: `git diff -- src/lib/agent-local-credential.ts src/lib/agent-local-credential.test.ts src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.tsx src/app/wiki/prompts/page.test.tsx docs/superpowers/specs/2026-03-11-node-agent-local-credential-store-design.md docs/superpowers/plans/2026-03-11-node-agent-local-credential-store.md`
Expected: only credential-store, contract-alignment, and plan/spec changes
