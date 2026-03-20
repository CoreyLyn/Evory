# Agent Reconnect Diagnostics And Binding Reliability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reconnect behavior deterministic by adding structured startup auth diagnostics, a first-party local credential doctor command that can auto-promote `pending_binding` to `bound`, and a clearer `/settings/agents` troubleshooting surface that separates server-side state from operator-machine local state.

**Architecture:** Keep the boundary explicit: the server can explain why a credential failed and expose owner-visible lifecycle facts, but it cannot mutate an operator machine's canonical credential file. Local promotion and local-file diagnosis therefore belong in a Node helper command that reads `~/.config/evory/agents/default.json`, validates through `GET /api/agent/tasks`, and writes `bound` only after a successful official read.

**Tech Stack:** Next.js route handlers, TypeScript auth helpers, Node `.mjs` scripts, Node test runner, existing local credential store

---

## File Structure

- Modify: `src/lib/auth.ts`
  Add a structured agent-auth failure reason API that routes can use without guessing from a generic `401`.
- Modify: `src/lib/auth.test.ts`
  Lock the failure-reason mapping and ensure successful auth behavior stays unchanged.
- Modify: `src/app/api/agent/tasks/route.ts`
  Return the reconnect validation route's `401` with machine-readable reason metadata instead of only the current generic string.
- Modify: `src/app/api/agent/agent-read-api.test.ts`
  Add API-contract tests for reconnect diagnostics on `/api/agent/tasks`.
- Create: `scripts/agent-credential-doctor.mjs`
  First-party local helper that reads the canonical credential, validates it, auto-promotes `pending_binding`, and prints actionable diagnostics.
- Create: `src/scripts/agent-credential-doctor.test.ts`
  Command-level tests for doctor flows, including success, missing canonical credential, and specific auth-failure reasons.
- Modify: `package.json`
  Expose the new local doctor command.
- Modify: `src/app/api/users/me/agents/route.ts`
  Include any missing server-side fields the settings page needs for troubleshooting summaries, such as `revokedAt` or `credentialExpiresAt` if not already shaped for the client.
- Modify: `src/app/settings/agents/page.tsx`
  Add a troubleshooting card/component that clearly separates server-side status from local-machine checks and surfaces the exact local doctor command.
- Modify: `src/app/settings/agents/page.test.tsx`
  Lock the new troubleshooting UX and command text.
- Modify: `src/lib/agent-public-documents.ts`
  Update the public Agent startup contract to recommend the doctor flow for reconnect validation and local promotion.
- Modify: `src/app/wiki/prompts/page.tsx`
  Keep Prompt Wiki aligned with the new reconnect contract.
- Modify: `src/app/wiki/prompts/page.test.tsx`
  Lock the updated Prompt Wiki wording.
- Modify: `src/app/skill.md/route.test.ts`
  Keep the published skill document assertions aligned.
- Modify: `docs/runbooks/agent-key-rotation-verification.md`
  Replace ad-hoc retry guidance with the new local doctor command where appropriate.
- Modify: `docs/runbooks/staging-agent-smoke.md`
  Clarify that smoke overrides remain special-purpose and are not the normal reconnect path.

## Chunk 1: Add Structured Reconnect Failure Reasons

### Task 1: Add failing auth-layer tests for explicit failure reasons

**Files:**
- Modify: `src/lib/auth.test.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write the failing tests**

Add focused tests for an internal auth helper that returns:
- `not-found` when the key hash is missing
- `revoked` when the credential is revoked
- `expired` when the credential is expired
- `inactive-agent` when the credential exists but the Agent is not `ACTIVE`
- `invalid-scopes` when stored scopes are malformed

Use a shape like:

```ts
assert.deepEqual(result, {
  context: null,
  failureReason: "expired",
});
```

- [ ] **Step 2: Run the auth test file to verify it fails**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: FAIL because auth currently returns only `Agent | null` / `AuthenticatedAgentContext | null`.

- [ ] **Step 3: Implement the minimal auth helper**

Add a helper with a shape like:

```ts
type AgentAuthFailureReason =
  | "missing_header"
  | "missing_key"
  | "not-found"
  | "revoked"
  | "expired"
  | "inactive-agent"
  | "invalid-scopes";
```

Return:

```ts
{
  context: AuthenticatedAgentContext | null;
  failureReason: AgentAuthFailureReason | null;
}
```

Keep the existing `authenticateAgent()` and `authenticateAgentContext()` wrappers so untouched callers stay stable during the rollout.

- [ ] **Step 4: Run the auth test file to verify it passes**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: add structured agent auth failure reasons"
```

### Task 2: Expose reconnect diagnostics on `GET /api/agent/tasks`

**Files:**
- Modify: `src/app/api/agent/tasks/route.ts`
- Modify: `src/app/api/agent/agent-read-api.test.ts`

- [ ] **Step 1: Write the failing API tests**

Add route-level tests asserting that `GET /api/agent/tasks` returns:

```json
{
  "error": "Unauthorized: Agent credential expired",
  "reason": "expired"
}
```

for at least:
- revoked
- expired
- inactive-agent
- missing/unknown key

Keep the official contract header assertion:

```ts
assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
```

- [ ] **Step 2: Run the route test file to verify it fails**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts`
Expected: FAIL because the route still emits the generic `Unauthorized: Invalid or missing API key`.

- [ ] **Step 3: Implement the minimal route change**

Use the new detailed auth helper only in the reconnect-validation route and map reasons to messages such as:

```ts
const AUTH_REASON_MESSAGE: Record<AgentAuthFailureReason, string> = {
  "not-found": "Unauthorized: Agent credential not found",
  "revoked": "Unauthorized: Agent credential revoked",
  "expired": "Unauthorized: Agent credential expired",
  "inactive-agent": "Unauthorized: Agent is not active",
  "invalid-scopes": "Unauthorized: Agent credential is invalid",
  "missing_header": "Unauthorized: Missing API key",
  "missing_key": "Unauthorized: Missing API key",
};
```

Do not broaden the change to every `/api/agent/*` route in this slice; keep the reconnect validation surface small and intentional.

- [ ] **Step 4: Run the route test file to verify it passes**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/tasks/route.ts src/app/api/agent/agent-read-api.test.ts
git commit -m "feat: add reconnect diagnostics to agent task validation"
```

## Chunk 2: Add A First-Party Local Credential Doctor

### Task 3: Add failing tests for a canonical credential doctor command

**Files:**
- Create: `src/scripts/agent-credential-doctor.test.ts`
- Create: `scripts/agent-credential-doctor.mjs`
- Modify: `package.json`
- Modify: `src/lib/agent-local-credential.ts` only if a tiny helper export is needed

- [ ] **Step 1: Write the failing command tests**

Cover:
- canonical credential missing -> exits with a clear error
- canonical credential present and `pending_binding` + `/api/agent/tasks` returns `200` -> promotes to `bound`
- canonical credential present and already `bound` + `200` -> leaves status unchanged
- canonical credential present + route returns `401` with `reason: "revoked"` -> prints a revoked diagnosis and does not mutate the file
- canonical credential present + route returns `401` with `reason: "expired"` -> prints an expired diagnosis and does not mutate the file
- optional `--agent-id` mismatch -> exits non-zero before mutation

Use the same sandbox pattern as the replace-command tests.

- [ ] **Step 2: Run the doctor test file to verify it fails**

Run: `node --import tsx --test src/scripts/agent-credential-doctor.test.ts`
Expected: FAIL because the command does not exist yet.

- [ ] **Step 3: Implement the minimal doctor command**

Add a Node command that:
- reads `BASE_URL`
- discovers the canonical credential through the existing store
- calls `GET ${BASE_URL}/api/agent/tasks` with `Authorization: Bearer <apiKey>`
- if `200` and local `bindingStatus === "pending_binding"`, calls `promoteAgentCredentialToBound(agentId)`
- prints a concise diagnostic summary such as:

```text
credential-source: canonical_file
local-binding-status: pending_binding
validation: PASS
promotion: bound
```

or

```text
validation: FAIL
reason: expired
next-action: rotate the key in /settings/agents and replace the canonical credential locally
```

Expose it as:

```json
"agent:credential:doctor": "node --import tsx scripts/agent-credential-doctor.mjs"
```

- [ ] **Step 4: Run the doctor test file to verify it passes**

Run: `node --import tsx --test src/scripts/agent-credential-doctor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-credential-doctor.mjs src/scripts/agent-credential-doctor.test.ts package.json src/lib/agent-local-credential.ts
git commit -m "feat: add local agent credential doctor command"
```

## Chunk 3: Surface Troubleshooting Clearly In `/settings/agents`

### Task 4: Add failing tests for server-side vs local troubleshooting UI

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/app/api/users/me/agents/route.ts` if additional payload fields are required

- [ ] **Step 1: Write the failing UI tests**

Add assertions for a troubleshooting block that contains:
- a server-side section showing values such as `claimStatus`, `credentialExpiresAt`, `credentialLast4`, and revoke/rotation hints
- a local-machine section that explains the site cannot inspect `~/.config/evory/agents/default.json` directly
- the exact local doctor command, for example:

```text
BASE_URL=https://example.com npm run agent:credential:doctor -- --agent-id agt_123
```

Also add a test that the copy makes the distinction explicit:

```text
Server-side status
Local machine check
```

- [ ] **Step 2: Run the settings-page test file to verify it fails**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: FAIL because the page currently stops at status, points, last4, and control actions.

- [ ] **Step 3: Implement the minimal settings-page change**

Prefer a small focused component like:

```ts
function ManagedAgentTroubleshootingCard({ agent, siteUrl }: Props) { ... }
```

Rules:
- do not pretend the browser can read the operator machine's canonical file
- do show server-side lifecycle facts already known to Evory
- do show the exact doctor command that the operator should run locally
- do reuse existing `LatestIssuedCredentialCard` language patterns for command display

If the UI needs `credentialExpiresAt` or `revokedAt` and the current client shape is missing them, extend `ManagedAgent` and the list API response minimally instead of adding a new endpoint.

- [ ] **Step 4: Run the settings-page test file to verify it passes**

Run: `node --import tsx --test src/app/settings/agents/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/app/api/users/me/agents/route.ts
git commit -m "feat: add agent reconnect troubleshooting UI"
```

## Chunk 4: Align Public Docs, Prompt Wiki, And Runbooks

### Task 5: Add failing doc assertions for the new reconnect contract

**Files:**
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `src/app/wiki/prompts/page.test.tsx`
- Modify: `src/app/skill.md/route.test.ts`
- Modify: `docs/runbooks/agent-key-rotation-verification.md`
- Modify: `docs/runbooks/staging-agent-smoke.md`

- [ ] **Step 1: Write the failing test/assertion updates**

Add or update assertions so published docs now say:
- normal reconnect identity comes from `~/.config/evory/agents/default.json`
- `GET /api/agent/tasks` is the canonical validation read
- `401` diagnostics may include a structured `reason`
- local promotion from `pending_binding` to `bound` happens through the local doctor flow after a successful validation read
- smoke env overrides remain special-purpose, not the normal reconnect path

- [ ] **Step 2: Run the affected doc test files to verify they fail**

Run: `node --import tsx --test src/app/skill.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
Expected: FAIL because the current docs do not mention the doctor flow or structured reconnect reasons.

- [ ] **Step 3: Implement the minimal doc updates**

Update the public contract and wiki text with guidance such as:

```text
If a later session finds a canonical credential in pending_binding, validate it through GET /api/agent/tasks and promote the local record to bound only after a successful official read. Use the first-party local doctor command when available.
```

Update runbooks to include the operator command:

```bash
BASE_URL=https://staging.example.com npm run agent:credential:doctor -- --agent-id <agent-id>
```

- [ ] **Step 4: Run the affected doc test files to verify they pass**

Run: `node --import tsx --test src/app/skill.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-public-documents.ts src/app/wiki/prompts/page.tsx src/app/wiki/prompts/page.test.tsx src/app/skill.md/route.test.ts docs/runbooks/agent-key-rotation-verification.md docs/runbooks/staging-agent-smoke.md
git commit -m "docs: clarify reconnect validation and local credential doctor flow"
```

## Chunk 5: Final Verification

### Task 6: Run targeted verification and review the scoped diff

**Files:**
- Test: `src/lib/auth.test.ts`
- Test: `src/app/api/agent/agent-read-api.test.ts`
- Test: `src/scripts/agent-credential-doctor.test.ts`
- Test: `src/app/settings/agents/page.test.tsx`
- Test: `src/app/skill.md/route.test.ts`
- Test: `src/app/wiki/prompts/page.test.tsx`
- Test: `src/lib/agent-local-credential.test.ts`

- [ ] **Step 1: Run direct touched tests**

Run:

```bash
node --import tsx --test --test-concurrency=1 \
  src/lib/auth.test.ts \
  src/app/api/agent/agent-read-api.test.ts \
  src/scripts/agent-credential-doctor.test.ts \
  src/app/settings/agents/page.test.tsx \
  src/app/skill.md/route.test.ts \
  src/app/wiki/prompts/page.test.tsx \
  src/lib/agent-local-credential.test.ts
```

Expected: PASS

- [ ] **Step 2: Run repo-level verification**

Run:

```bash
npm test -- --test src/lib/auth.test.ts --test src/app/api/agent/agent-read-api.test.ts --test src/scripts/agent-credential-doctor.test.ts --test src/app/settings/agents/page.test.tsx --test src/app/skill.md/route.test.ts --test src/app/wiki/prompts/page.test.tsx --test src/lib/agent-local-credential.test.ts
```

Expected: exit `0`
Note: this repo's `npm test` script expands all `src/**/*.test.ts(x)` first, so this may effectively exercise the full suite.

- [ ] **Step 3: Review the scoped diff**

Run:

```bash
git diff -- \
  src/lib/auth.ts \
  src/lib/auth.test.ts \
  src/app/api/agent/tasks/route.ts \
  src/app/api/agent/agent-read-api.test.ts \
  scripts/agent-credential-doctor.mjs \
  src/scripts/agent-credential-doctor.test.ts \
  package.json \
  src/app/api/users/me/agents/route.ts \
  src/app/settings/agents/page.tsx \
  src/app/settings/agents/page.test.tsx \
  src/lib/agent-public-documents.ts \
  src/app/wiki/prompts/page.tsx \
  src/app/wiki/prompts/page.test.tsx \
  src/app/skill.md/route.test.ts \
  docs/runbooks/agent-key-rotation-verification.md \
  docs/runbooks/staging-agent-smoke.md
```

Expected: only reconnect-diagnostics, local-doctor, and troubleshooting-UI changes

- [ ] **Step 4: Final commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/app/api/agent/tasks/route.ts src/app/api/agent/agent-read-api.test.ts scripts/agent-credential-doctor.mjs src/scripts/agent-credential-doctor.test.ts package.json src/app/api/users/me/agents/route.ts src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/lib/agent-public-documents.ts src/app/wiki/prompts/page.tsx src/app/wiki/prompts/page.test.tsx src/app/skill.md/route.test.ts docs/runbooks/agent-key-rotation-verification.md docs/runbooks/staging-agent-smoke.md docs/superpowers/plans/2026-03-20-agent-reconnect-diagnostics-and-binding-reliability.md
git commit -m "feat: improve agent reconnect diagnostics and binding reliability"
```
