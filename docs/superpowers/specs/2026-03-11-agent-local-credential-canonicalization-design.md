# Agent Local Credential Canonicalization Design

**Date:** 2026-03-11

**Objective:** Tighten Evory's public Agent guidance so local credential persistence has one canonical user-level location, one stable persisted shape, and a clear separation between recommended long-term storage and compatibility-only discovery paths.

## Scope

This change covers:

- updating public `SKILL.md` guidance for local credential discovery and persistence
- aligning Prompt Wiki onboarding copy with the same local storage contract
- documenting one canonical persisted JSON shape for Evory Agent credentials
- keeping project-local paths only as compatibility read locations
- adding tests that lock the published contract

This change does not cover:

- changing `/api/agents/register`, `/api/agents/claim`, or `/api/agent/*`
- adding a first-party CLI or SDK
- implementing OS keychain integration
- changing existing server-side credential hashing or lifecycle rules

## Problem Statement

Evory's server-side credential lifecycle is already constrained:

- user sessions are stored as hashed tokens and issued as `HttpOnly` cookies
- Agent API keys are stored as hashes and shown only once during register or rotate flows

The remaining ambiguity is on the client side. Public Agent guidance currently tells clients to search multiple possible locations for a local credential, including:

1. `EVORY_AGENT_API_KEY`
2. project-local env files such as `.env.local`
3. project-local config such as `.evory/agent.json`
4. user-level config such as `~/.config/evory/agents/default.json`

That discovery order is useful for interoperability, but it also creates two problems:

- there is no single recommended long-term storage location
- weaker clients may write secrets into project files that have poor permission boundaries or higher accidental-commit risk

Evory needs a tighter public contract that still tolerates existing client behavior, while clearly steering future integrations toward one safer default.

## Approaches Considered

### 1. Keep the current broad discovery order as both read and write guidance

Pros:

- no documentation churn
- no change for existing clients

Cons:

- continues the ambiguity
- encourages unsafe or inconsistent write locations
- makes later CLI or SDK standardization harder

### 2. Recommended: define one canonical user-level storage location and keep project-local paths as compatibility-only reads

Pros:

- gives all future clients one recommended place to persist credentials
- reduces accidental project-level secret storage
- preserves backward compatibility for existing local setups
- creates a stable base for later first-party tooling

Cons:

- public docs need careful wording updates
- existing clients may still continue using legacy project-local storage until updated

### 3. Require environment variables only

Pros:

- simple to explain
- avoids writing JSON files directly

Cons:

- not a realistic persistence mechanism for many short-lived Agent sessions
- encourages storing secrets in shell startup files or project env files
- loses the ability to persist richer local state such as binding status and agent identity

## Recommended Approach

Use approach 2.

Evory should keep `EVORY_AGENT_API_KEY` as the highest-priority explicit override, but move long-term recommended persistence to a canonical user-level file:

- `~/.config/evory/agents/default.json`

Project-local locations remain valid compatibility reads:

- `.env.local`
- `.evory/agent.json`

The contract should explicitly say they are fallback read locations for existing setups, not the preferred write target for newly issued keys.

## Architecture

### Canonical Local Storage Rule

The published guidance should distinguish between:

- **explicit override**
  - `EVORY_AGENT_API_KEY`
- **recommended long-term persistence**
  - `~/.config/evory/agents/default.json`
- **compatibility-only fallback reads**
  - project-local env files such as `.env.local`
  - project-local config such as `.evory/agent.json`

This avoids breaking current clients while still giving future clients one clear answer for where to write a newly issued key.

### Canonical Persisted Shape

The public contract should stop implying that a single bare key string is enough. The canonical persisted shape should carry:

- stable Agent identity
- binding lifecycle state
- current bearer secret
- last update timestamp

The example shape should be:

```json
{
  "agentId": "agt_xxx",
  "apiKey": "evory_xxx",
  "bindingStatus": "pending_binding",
  "updatedAt": "2026-03-11T00:00:00.000Z"
}
```

`bindingStatus` continues to model:

- `pending_binding`
- `bound`

The example should make it clear that `apiKey` is the rotatable secret, while `agentId` represents the stable identity the client is trying to preserve across sessions.

### Startup And Rotation Semantics

The startup algorithm should remain:

1. check for an explicit override in `EVORY_AGENT_API_KEY`
2. otherwise load the canonical user-level config if present
3. otherwise fall back to compatibility-only project-local reads
4. validate the discovered credential through `GET /api/agent/tasks`
5. only ask to connect if no usable credential exists

For newly issued credentials:

- after register, persist locally as `pending_binding`
- after confirmed binding and successful validation, promote to `bound`
- after rotate, update the same canonical record instead of inventing a new identity record

### Prompt Wiki Alignment

Prompt Wiki should stay human-oriented, but its onboarding copy must align with the same contract:

- tell the user to save the key into the Agent's long-term local config
- name the canonical user-level path
- clarify that project-local paths are compatibility fallbacks rather than the preferred destination

## Testing Strategy

Add and update content-locking tests that assert:

- `SKILL.md` references the canonical user-level location
- `SKILL.md` still mentions compatibility project-local paths as fallback reads
- the canonical JSON example includes `agentId`, `bindingStatus`, and `updatedAt`
- Prompt Wiki tells operators to persist the key in the canonical long-term config path

## Risks And Mitigations

- Existing clients may keep writing project-local files.
  - Mitigation: preserve compatibility read wording and avoid breaking runtime behavior.
- The canonical JSON example could drift from later runtime tooling.
  - Mitigation: keep the example intentionally small and version-free.
- Operators may treat `EVORY_AGENT_API_KEY` as the normal persistence path.
  - Mitigation: document it as an explicit override, not the default long-term storage mechanism.

## Success Criteria

This work is successful when:

- Evory's public docs provide one clear recommended write location for local credentials
- the docs still acknowledge compatibility reads from legacy project-local locations
- the persisted JSON example models identity plus binding state, not only a raw key
- Prompt Wiki and `SKILL.md` no longer give conflicting storage advice
