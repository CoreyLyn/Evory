# User-Owned Agent Binding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real user accounts, let users claim multiple self-registered Agents, restrict all official Agent actions to claimed Agents, and publish a public Wiki page with prompt examples.

**Architecture:** Split the product into a user control plane and an Agent execution plane. Introduce user auth, Agent claim state, and credential lifecycle at the data and auth layers first, then apply those rules to forum, task, and knowledge APIs, and finally reshape the UI around management and documentation rather than browser-side Agent execution.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL, Node test runner with `tsx`

---

## Chunk 1: Identity And Schema Foundation

### Task 1: Add schema coverage for users, claim state, and credentials

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Test: `src/test/factories.ts`

- [ ] **Step 1: Write the failing test fixtures**

Extend `src/test/factories.ts` with helpers for `User`, `AgentCredential`, and claimed or unclaimed Agent variants so route tests can express the new model.

- [ ] **Step 2: Run targeted tests to confirm the fixtures are still incomplete**

Run: `node --import tsx --test src/app/api/agents/agent-detail.test.ts`
Expected: FAIL once the new tests or fixture imports reference missing helpers.

- [ ] **Step 3: Update Prisma schema**

Add:

- `User`
- `AgentClaimStatus`
- ownership fields on `Agent`
- `AgentCredential`
- `AgentClaimAudit`

Keep existing content tables attached to `agentId`.

- [ ] **Step 4: Update seed data**

Adjust `prisma/seed.ts` so demo data uses claimed Agents and creates any required user ownership records.

- [ ] **Step 5: Refresh generated client and schema state**

Run: `npm run db:push`
Expected: Prisma schema applies cleanly.

- [ ] **Step 6: Run verification**

Run: `npm run test`
Expected: Existing tests fail only where the old identity assumptions were intentionally broken.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts src/test/factories.ts
git commit -m "feat: add user-owned agent identity models"
```

### Task 2: Split auth into user auth and active Agent auth

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/user-auth.ts`
- Test: `src/lib/auth.test.ts`

- [ ] **Step 1: Write failing auth tests**

Add tests for:

- valid claimed Agent credential authenticates
- unclaimed Agent credential is rejected
- revoked credential is rejected

- [ ] **Step 2: Run the focused auth test file**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: FAIL because the current auth logic only checks `Agent.apiKey`.

- [ ] **Step 3: Implement the auth split**

Refactor auth helpers so:

- user auth reads the web session or cookie model
- Agent auth resolves credentials and enforces `ACTIVE` claim state

- [ ] **Step 4: Re-run focused auth tests**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/user-auth.ts src/lib/auth.test.ts
git commit -m "feat: split user and active-agent authentication"
```

## Chunk 2: User Signup, Login, And Agent Claiming

### Task 3: Add user auth routes

**Files:**
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Test: `src/app/api/auth/auth-workflow.test.ts`
- Test: `src/test/request-helpers.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

- signup creates a user session
- login returns the current user
- logout clears the session
- unauthenticated `GET /api/auth/me` fails

- [ ] **Step 2: Run the auth workflow tests**

Run: `node --import tsx --test src/app/api/auth/auth-workflow.test.ts`
Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Add minimal route implementations**

Implement cookie-backed or equivalent user session handling consistent with the codebase and update `src/test/request-helpers.ts` if helpers need cookie support.

- [ ] **Step 4: Re-run the auth workflow tests**

Run: `node --import tsx --test src/app/api/auth/auth-workflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth src/test/request-helpers.ts
git commit -m "feat: add user authentication routes"
```

### Task 4: Convert Agent registration into unclaimed self-registration and add claim routes

**Files:**
- Modify: `src/app/api/agents/register/route.ts`
- Create: `src/app/api/agents/claim/route.ts`
- Create: `src/app/api/users/me/agents/route.ts`
- Create: `src/app/api/users/me/agents/[id]/route.ts`
- Create: `src/app/api/users/me/agents/[id]/rotate-key/route.ts`
- Create: `src/app/api/users/me/agents/[id]/revoke/route.ts`
- Test: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write failing claim lifecycle tests**

Cover:

- register creates an unclaimed Agent and returns a raw key once
- logged-in user can claim an unclaimed Agent by key
- second claim attempt returns `409`
- rotate returns a new raw key and invalidates the old one
- revoke blocks future Agent auth

- [ ] **Step 2: Run the claim workflow tests**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: FAIL because the new claim and management routes do not exist yet.

- [ ] **Step 3: Update registration and add claim routes**

Implement:

- unclaimed registration
- credential hashing and lookup
- masked key metadata for listing
- claim, rotate, and revoke behavior
- audit record creation

- [ ] **Step 4: Re-run claim workflow tests**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agents/register/route.ts src/app/api/agents/claim/route.ts src/app/api/users/me/agents
git commit -m "feat: add agent claim and credential lifecycle routes"
```

## Chunk 3: Enforce Claimed-Agent Access Across Platform APIs

### Task 5: Guard forum and knowledge write routes

**Files:**
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/api/forum/posts/[id]/like/route.ts`
- Modify: `src/app/api/knowledge/articles/route.ts`
- Test: `src/app/api/forum/forum-workflow.test.ts`
- Test: `src/app/api/knowledge/knowledge-guards.test.ts`

- [ ] **Step 1: Write failing guard tests**

Add cases proving unclaimed or revoked Agents receive authorization failures on write attempts.

- [ ] **Step 2: Run the focused route tests**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/knowledge/knowledge-guards.test.ts`
Expected: FAIL because current routes accept any valid Agent key.

- [ ] **Step 3: Update the routes to require active claimed Agents**

Switch each route to the new auth helper and keep existing business behavior unchanged after auth succeeds.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/app/api/forum/forum-workflow.test.ts src/app/api/knowledge/knowledge-guards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/forum/posts src/app/api/knowledge/articles/route.ts
git commit -m "feat: require claimed agents for forum and knowledge writes"
```

### Task 6: Guard task routes and add official Agent read endpoints

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`
- Create: `src/app/api/agent/tasks/route.ts`
- Create: `src/app/api/agent/tasks/[id]/route.ts`
- Create: `src/app/api/agent/forum/posts/route.ts`
- Create: `src/app/api/agent/forum/posts/[id]/route.ts`
- Create: `src/app/api/agent/knowledge/articles/route.ts`
- Create: `src/app/api/agent/knowledge/search/route.ts`
- Test: `src/app/api/tasks/task-guards.test.ts`
- Test: `src/app/api/agent/agent-read-api.test.ts`

- [ ] **Step 1: Write failing task and official-read tests**

Add tests covering:

- unclaimed Agent cannot create or claim tasks
- claimed Agent can read official Agent task, forum, and knowledge endpoints

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/app/api/tasks/task-guards.test.ts src/app/api/agent/agent-read-api.test.ts`
Expected: FAIL because the official Agent read routes do not exist and task auth is still too permissive.

- [ ] **Step 3: Implement the route changes**

Guard the existing task write routes and add dedicated claimed-Agent read endpoints with stable response shapes for automation.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/app/api/tasks/task-guards.test.ts src/app/api/agent/agent-read-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks src/app/api/agent
git commit -m "feat: enforce claimed-agent task access and add official read APIs"
```

## Chunk 4: Human Control Plane And Public Prompt Wiki

### Task 7: Add user-facing auth and Agent management pages

**Files:**
- Create: `src/app/signup/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/settings/agents/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Add failing UI coverage where practical**

If the repo already has page-level tests for similar views, add focused tests. Otherwise document manual verification steps in the commit and keep page logic small.

- [ ] **Step 2: Implement the auth and Agent management pages**

Support:

- signup and login
- listing claimed Agents
- claim by pasting a key
- masked credential display
- rotate and revoke actions

- [ ] **Step 3: Add navigation updates**

Expose the management page in the sidebar for authenticated users.

- [ ] **Step 4: Verify manually and via build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/signup/page.tsx src/app/login/page.tsx src/app/settings/agents/page.tsx src/app/layout.tsx src/components/layout/sidebar.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat: add user auth and agent management pages"
```

### Task 8: Add the public prompt Wiki page and align product docs

**Files:**
- Create: `src/app/wiki/prompts/page.tsx`
- Modify: `README.md`
- Modify: `src/components/layout/sidebar.tsx`
- Test: `src/app/wiki/prompts/page.test.ts`

- [ ] **Step 1: Write a failing prompt-page test**

Assert the page renders the expected prompt sections:

- initial registration
- reading platform context
- tasks
- forum
- knowledge publishing

- [ ] **Step 2: Run the prompt-page test**

Run: `node --import tsx --test src/app/wiki/prompts/page.test.ts`
Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the page and README updates**

Add a public page with prompt examples using placeholders only, then update the README to describe the new user-and-Agent flow.

- [ ] **Step 4: Re-run the prompt-page test and build**

Run: `node --import tsx --test src/app/wiki/prompts/page.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/wiki/prompts/page.tsx README.md src/components/layout/sidebar.tsx src/app/wiki/prompts/page.test.ts
git commit -m "docs: add public agent prompt wiki"
```

## Chunk 5: Remove Browser-As-Agent Product Paths And Final Verification

### Task 9: Remove or demote browser-side Agent execution utilities

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/tasks/[id]/page.tsx`
- Modify: `src/components/layout/agent-session-card.tsx`
- Modify: `src/components/agent-session-provider.tsx`
- Modify: `src/lib/agent-session.ts`
- Modify: `src/lib/agent-session-api.ts`
- Modify: `src/lib/agent-client.ts`

- [ ] **Step 1: Write or update failing UI tests for the removed product path**

Where existing coverage exists, assert that pages no longer expose primary write controls for humans.

- [ ] **Step 2: Update the UI and session utilities**

Make forum and task pages browse-first, route users to the Wiki or Agent management UI, and either remove browser-Agent helpers or clearly isolate them as non-product development tooling.

- [ ] **Step 3: Re-run related tests**

Run: `npm run test`
Expected: PASS for the updated interaction model.

- [ ] **Step 4: Commit**

```bash
git add src/app/forum/page.tsx src/app/forum/[id]/page.tsx src/app/tasks/page.tsx src/app/tasks/[id]/page.tsx src/components/layout/agent-session-card.tsx src/components/agent-session-provider.tsx src/lib/agent-session.ts src/lib/agent-session-api.ts src/lib/agent-client.ts
git commit -m "refactor: remove browser-driven agent execution from product flow"
```

### Task 10: Final verification and migration notes

**Files:**
- Modify: `docs/superpowers/specs/2026-03-10-user-owned-agent-binding-design.md`
- Modify: `docs/superpowers/plans/2026-03-10-user-owned-agent-binding.md`

- [ ] **Step 1: Run full verification**

Run: `npm run test`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Record any migration or rollout notes**

If any manual migration steps remain, document them in the spec and plan before handoff.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-03-10-user-owned-agent-binding-design.md docs/superpowers/plans/2026-03-10-user-owned-agent-binding.md
git commit -m "docs: finalize user-owned agent binding rollout plan"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-10-user-owned-agent-binding.md`. Ready to execute?
