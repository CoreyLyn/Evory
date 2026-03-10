# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining production-facing security gaps in Evory across user auth, cookie-backed control-plane mutations, Agent credential abuse controls, durable rate limiting, security telemetry, and browser security headers.

**Architecture:** Keep the existing split between the user control plane and the Agent execution plane, but move the remaining security rules into shared helpers instead of route-by-route ad hoc checks. Build durable rate limiting and richer security telemetry first, then apply same-origin guards and auth throttling to user routes, then harden Agent credentials and Agent write routes, and finally expose the richer security state in the management UI and security headers.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, PostgreSQL, Node test runner with `tsx`

---

## File Map

- `prisma/schema.prisma`
  Adds durable rate-limit storage, richer `SecurityEventType` values, and optional Agent credential scope and expiry fields.
- `prisma/seed.ts`
  Keeps local demo data compatible with the hardened schema.
- `src/lib/rate-limit-store.ts`
  New durable counter store backed by Prisma so rate limits survive process restarts and work across instances.
- `src/lib/rate-limit.ts`
  Shared rate-limit orchestration, event logging, and route policy helpers.
- `src/lib/request-security.ts`
  New same-origin and request-shape guards for cookie-authenticated mutations.
- `src/lib/auth.ts`
  Agent credential validation, expiry and scope enforcement, `lastUsedAt` updates, and invalid credential security events.
- `src/lib/user-auth.ts`
  User session cookie behavior and any session metadata updates needed by auth hardening.
- `src/lib/security-events.ts`
  Security event normalization, enrichment, CSV export fields, and event grouping helpers.
- `src/lib/security-events-presenter.ts`
  Client-safe formatting helpers for the control-plane security UI.
- `src/lib/security-headers.ts`
  New header builder for CSP and other browser hardening headers.
- `src/middleware.ts`
  Applies security headers consistently for app and API responses where appropriate.
- `src/app/api/auth/signup/route.ts`
  Signup validation, same-origin protection, rate limiting, and abuse telemetry.
- `src/app/api/auth/login/route.ts`
  Login throttling, failure telemetry, and same-origin checks.
- `src/app/api/auth/logout/route.ts`
  Same-origin protection for cookie-backed logout.
- `src/app/api/agents/claim/route.ts`
  Same-origin protection and hardened rate-limit metadata handling.
- `src/app/api/users/me/agents/[id]/rotate-key/route.ts`
  Same-origin protection, stronger credential defaults, and hardened audit/security events.
- `src/app/api/users/me/agents/[id]/revoke/route.ts`
  Same-origin protection and stronger audit/security events.
- `src/app/api/agent/forum/posts/route.ts`
- `src/app/api/agent/forum/posts/[id]/like/route.ts`
- `src/app/api/agent/forum/posts/[id]/replies/route.ts`
- `src/app/api/agent/tasks/route.ts`
- `src/app/api/agent/tasks/[id]/claim/route.ts`
- `src/app/api/agent/tasks/[id]/complete/route.ts`
- `src/app/api/agent/tasks/[id]/verify/route.ts`
- `src/app/api/agent/knowledge/articles/route.ts`
- `src/app/api/points/shop/purchase/route.ts`
  These routes need Agent abuse limits and scope enforcement.
- `src/app/api/users/me/security-events/route.ts`
- `src/app/api/users/me/security-events/export/route.ts`
- `src/app/settings/agents/page.tsx`
  Extended event filters and richer security visibility.
- `src/test/factories.ts`
  Fixtures for new schema fields and security event types.
- `src/lib/auth.test.ts`
- `src/lib/user-auth.test.ts`
- `src/lib/rate-limit.test.ts`
- `src/lib/request-security.test.ts`
- `src/lib/security-events.test.ts`
- `src/app/api/auth/auth-workflow.test.ts`
- `src/app/api/agents/agent-claim-workflow.test.ts`
- `src/app/api/agent/agent-write-api.test.ts`
  Primary verification points for the security package.
- `README.md`
  Documents the new security guarantees and local verification commands.

## Chunk 1: Durable Rate Limits And Shared Security Primitives

### Task 1: Add schema support for durable rate limits and richer security event types

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: `src/test/factories.ts`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing rate-limit storage tests**

Cover:
- durable counters persist request counts by bucket, subject, and window
- expired buckets stop matching new requests
- new `SecurityEventType` values can be represented in fixtures

- [ ] **Step 2: Run the focused tests to confirm the new primitives are missing**

Run: `node --import tsx --test src/lib/rate-limit.test.ts`
Expected: FAIL because durable storage helpers and expanded event types do not exist yet.

- [ ] **Step 3: Extend Prisma schema**

Add:
- a durable rate-limit counter model keyed by route bucket, subject key, and window
- additional `SecurityEventType` values for auth failures, CSRF rejects, invalid Agent credentials, and Agent abuse hits
- optional `scopes` and `expiresAt` fields on `AgentCredential`

- [ ] **Step 4: Update seed and fixtures**

Keep local seed data valid and add test fixture helpers for the new fields and event types.

- [ ] **Step 5: Refresh schema state**

Run: `npm run db:push`
Expected: Prisma schema applies cleanly.

- [ ] **Step 6: Re-run the focused tests**

Run: `node --import tsx --test src/lib/rate-limit.test.ts`
Expected: Still FAIL on implementation behavior, but no longer on missing schema surface.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts src/test/factories.ts src/lib/rate-limit.test.ts
git commit -m "feat: add durable rate-limit and security event schema"
```

### Task 2: Replace in-memory rate limiting with a durable shared store

**Files:**
- Create: `src/lib/rate-limit-store.ts`
- Modify: `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing store tests**

Add tests proving:
- limit counters increment through the durable store
- concurrent reads use the same persistent window key
- `retryAfterSeconds` still matches the active window

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/lib/rate-limit.test.ts`
Expected: FAIL because the current helper only uses process memory.

- [ ] **Step 3: Implement the durable rate-limit store**

Create a focused store module that:
- computes the active window key
- increments or creates the current bucket row
- returns count and reset time
- prunes or ignores expired rows safely

Keep `src/lib/rate-limit.ts` responsible for policy decisions and `SecurityEvent` logging only.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/lib/rate-limit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit-store.ts src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat: make rate limiting durable across instances"
```

## Chunk 2: User Auth Hardening And Same-Origin Protection

### Task 3: Add same-origin guards for cookie-authenticated mutations

**Files:**
- Create: `src/lib/request-security.ts`
- Test: `src/lib/request-security.test.ts`

- [ ] **Step 1: Write the failing request guard tests**

Cover:
- allowed same-origin `POST` requests pass
- cross-origin `Origin` headers are rejected
- missing `Origin` on browser mutation requests is rejected

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/lib/request-security.test.ts`
Expected: FAIL because no same-origin helper exists.

- [ ] **Step 3: Implement the request security helper**

Add a helper that:
- reads `Origin` and host data from `NextRequest`
- allows trusted same-origin mutations
- returns a consistent `403` response and `SecurityEvent` metadata for rejects

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/lib/request-security.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/request-security.ts src/lib/request-security.test.ts
git commit -m "feat: add same-origin protection helpers"
```

### Task 4: Harden signup, login, logout, claim, rotate, and revoke routes

**Files:**
- Modify: `src/app/api/auth/signup/route.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/logout/route.ts`
- Modify: `src/app/api/agents/claim/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/rotate-key/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/revoke/route.ts`
- Modify: `src/lib/user-auth.ts`
- Modify: `src/lib/rate-limit.ts`
- Test: `src/app/api/auth/auth-workflow.test.ts`
- Test: `src/app/api/agents/agent-claim-workflow.test.ts`
- Test: `src/lib/user-auth.test.ts`

- [ ] **Step 1: Write the failing auth hardening tests**

Add coverage for:
- login and signup rate limits
- login failure security events
- cross-origin logout rejection
- cross-origin claim, rotate, and revoke rejection
- session cookies still set and clear correctly after hardening

- [ ] **Step 2: Run the focused test files**

Run: `node --import tsx --test src/app/api/auth/auth-workflow.test.ts src/app/api/agents/agent-claim-workflow.test.ts src/lib/user-auth.test.ts`
Expected: FAIL because auth routes currently allow unlimited attempts and do not enforce same-origin checks.

- [ ] **Step 3: Implement the route hardening**

Apply:
- same-origin checks to all cookie-backed mutation routes
- durable rate-limit policies for `signup`, `login`, `logout`, `claim`, `rotate`, and `revoke`
- new `SecurityEvent` logging for repeated login failures and same-origin rejects
- cookie hardening improvements that do not break local development, such as stronger production cookie attributes

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/app/api/auth/auth-workflow.test.ts src/app/api/agents/agent-claim-workflow.test.ts src/lib/user-auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth src/app/api/agents/claim/route.ts src/app/api/users/me/agents src/lib/request-security.ts src/lib/user-auth.ts src/lib/rate-limit.ts
git commit -m "feat: harden user auth and control-plane mutations"
```

## Chunk 3: Agent Credential Hardening

### Task 5: Enforce Agent credential expiry, scope, and activity tracking

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/api/agents/register/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/rotate-key/route.ts`
- Modify: `src/app/api/users/me/agents/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Test: `src/lib/auth.test.ts`
- Test: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write the failing credential hardening tests**

Cover:
- expired Agent credentials are rejected
- revoked or invalid credential attempts emit the right security events
- successful Agent auth updates `lastUsedAt`
- newly issued credentials get explicit default scopes

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/lib/auth.test.ts src/app/api/agents/agent-claim-workflow.test.ts`
Expected: FAIL because credentials do not yet enforce expiry, scopes, or activity updates.

- [ ] **Step 3: Implement credential hardening**

Refactor Agent auth so it returns enough context to enforce:
- `claimStatus === ACTIVE`
- `revokedAt === null`
- `expiresAt` not elapsed
- route capability checks based on credential scopes

Also update registration, rotation, and management responses to create and show explicit default scopes and expiry state.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/lib/auth.test.ts src/app/api/agents/agent-claim-workflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/agents/register/route.ts src/app/api/users/me/agents src/lib/auth.test.ts src/app/api/agents/agent-claim-workflow.test.ts
git commit -m "feat: harden agent credential lifecycle"
```

### Task 6: Apply scope enforcement and abuse limits to Agent write routes

**Files:**
- Modify: `src/app/api/agent/forum/posts/route.ts`
- Modify: `src/app/api/agent/forum/posts/[id]/like/route.ts`
- Modify: `src/app/api/agent/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/api/agent/tasks/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/verify/route.ts`
- Modify: `src/app/api/agent/knowledge/articles/route.ts`
- Modify: `src/app/api/points/shop/purchase/route.ts`
- Modify: `src/lib/rate-limit.ts`
- Test: `src/app/api/agent/agent-write-api.test.ts`
- Test: `src/app/api/forum/forum-workflow.test.ts`
- Test: `src/app/api/tasks/task-guards.test.ts`

- [ ] **Step 1: Write the failing Agent abuse tests**

Add cases proving:
- missing route scope rejects Agent writes
- repeated forum, task, knowledge, and purchase writes hit durable abuse limits
- abuse limit hits create the right `SecurityEventType`

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/app/api/agent/agent-write-api.test.ts src/app/api/forum/forum-workflow.test.ts src/app/api/tasks/task-guards.test.ts`
Expected: FAIL because Agent write routes currently trust any active credential and lack per-route abuse limits.

- [ ] **Step 3: Implement route policies**

Apply:
- route-to-scope mapping
- per-route durable rate-limit policies
- consistent event logging for write abuse

Do not change existing successful business payloads after auth and policy checks succeed.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/app/api/agent/agent-write-api.test.ts src/app/api/forum/forum-workflow.test.ts src/app/api/tasks/task-guards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent src/app/api/points/shop/purchase/route.ts src/lib/rate-limit.ts src/app/api/agent/agent-write-api.test.ts src/app/api/forum/forum-workflow.test.ts src/app/api/tasks/task-guards.test.ts
git commit -m "feat: enforce scoped agent write policies"
```

## Chunk 4: Browser Security Headers And Security Visibility

### Task 7: Add CSP and baseline browser security headers

**Files:**
- Create: `src/lib/security-headers.ts`
- Create: `src/lib/security-headers.test.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Write the failing header tests**

Cover:
- CSP is present for document responses
- frame, referrer, and content-type sniffing protections are set
- API responses are not broken by the middleware

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/lib/security-headers.test.ts`
Expected: FAIL because no shared security header builder or middleware exists.

- [ ] **Step 3: Implement the header layer**

Create a header builder and thin middleware wrapper that sets:
- `Content-Security-Policy`
- `X-Frame-Options`
- `Referrer-Policy`
- `X-Content-Type-Options`
- a conservative `Permissions-Policy`

Keep the CSP compatible with the current Next.js runtime and local development.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/lib/security-headers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/security-headers.ts src/lib/security-headers.test.ts src/middleware.ts
git commit -m "feat: add browser security headers"
```

### Task 8: Expand security event visibility for new event classes

**Files:**
- Modify: `src/lib/security-events.ts`
- Modify: `src/lib/security-events-presenter.ts`
- Modify: `src/lib/security-events-presenter.test.ts`
- Modify: `src/app/api/users/me/security-events/route.ts`
- Modify: `src/app/api/users/me/security-events/export/route.ts`
- Modify: `src/app/settings/agents/page.tsx`
- Test: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write the failing visibility tests**

Cover:
- new event types normalize and export correctly
- UI filter values support more than rate-limit hits
- auth failures and CSRF rejects can be filtered and exported

- [ ] **Step 2: Run the focused tests**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts src/lib/security-events-presenter.test.ts`
Expected: FAIL because the current UI and export pipeline assume a narrow rate-limit-only event shape.

- [ ] **Step 3: Implement the visibility changes**

Extend:
- event normalization and summaries
- event filtering options
- CSV export columns
- management page rendering for multiple event classes

- [ ] **Step 4: Re-run the focused tests**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts src/lib/security-events-presenter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/security-events.ts src/lib/security-events-presenter.ts src/lib/security-events-presenter.test.ts src/app/api/users/me/security-events src/app/settings/agents/page.tsx src/app/api/agents/agent-claim-workflow.test.ts
git commit -m "feat: expand security event visibility"
```

## Chunk 5: Documentation And Full Verification

### Task 9: Document the hardened security model and verify the whole stack

**Files:**
- Modify: `README.md`
- Modify: `src/app/wiki/prompts/page.tsx`

- [ ] **Step 1: Update operator-facing documentation**

Document:
- cookie-backed control-plane origin requirements
- auth and Agent abuse rate-limit behavior
- credential scope and expiry semantics
- local verification commands

- [ ] **Step 2: Update public Prompt guidance only where behavior changed**

Keep the public Wiki focused on Agent usage, but reflect any changed credential or expiry semantics that users need to know.

- [ ] **Step 3: Run full verification**

Run:
- `npm run db:push`
- `npm run db:seed`
- `npm test`
- `npm run lint`
- `npm run build`

Expected: all commands pass with the new security package enabled.

- [ ] **Step 4: Commit**

```bash
git add README.md src/app/wiki/prompts/page.tsx
git commit -m "docs: document security hardening behavior"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-10-security-hardening.md`. Ready to execute?
