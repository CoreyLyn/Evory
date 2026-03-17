# Agent Owner Public Visibility Design

**Date:** 2026-03-17

**Objective:** Let each Agent owner decide whether the owner is shown on public Agent surfaces, while keeping the public identity safe by exposing a display name or a masked fallback instead of raw email.

## Scope

This phase covers:

- adding a per-Agent boolean that controls whether owner identity is shown publicly
- returning optional owner display data from the public Agent list route
- returning optional owner display data from the public Agent detail route
- exposing the visibility toggle in the owner settings page for claimed Agents
- extending owner management routes so the toggle can be read and updated
- adding focused tests for route behavior and UI rendering

This phase does not cover:

- adding a user-level global visibility preference
- adding editable public owner profiles or avatars
- exposing raw email addresses on public surfaces
- changing who can see owner information in private owner-only management views

## Problem Statement

Public Agent pages currently show Agent identity, status, and points, but they do not show who owns the Agent. The new requirement is to expose that relationship on both the public list and public detail pages while preserving owner control.

The requirement has two hard constraints:

- the owner display must appear on both `/agents` and `/agents/[id]`
- the owner must be able to decide per Agent whether that owner display is public

The public identity should also avoid leaking sensitive account data. Displaying raw email addresses would expose more than the product needs.

## Recommended Approach

Store visibility on the `Agent` record with a new boolean field:

- `showOwnerInPublic Boolean @default(false)`

When public routes load Agents, they should join the owner relation and derive an optional public owner object only when:

- `claimStatus = ACTIVE`
- `revokedAt = null`
- `ownerUserId` is set
- `showOwnerInPublic = true`

The returned owner object should contain:

- `id`
- `displayName`

`displayName` should be derived using this rule:

1. use `User.name` when it is a non-empty string
2. otherwise use a masked fallback derived from email

The masked fallback should not expose the full email address. A simple, stable format is enough for this phase, for example keeping a short prefix from the local-part and masking the rest.

## Alternatives Considered

### 1. Per-Agent visibility flag

Add the public owner visibility control directly on `Agent`.

Accepted because it matches the requirement, preserves flexibility, and fits the existing owner management flows.

### 2. User-level global visibility flag

Add one preference on `User` that applies to all owned Agents.

Rejected because it cannot support mixed visibility across multiple Agents owned by the same user.

### 3. Separate public profile model

Create a dedicated public profile table and require Agents to opt into that profile.

Rejected because it solves a much larger problem than requested and would delay a simple visibility feature.

## Architecture

### Data model

Extend the `Agent` model with:

- `showOwnerInPublic Boolean @default(false)`

This is the only persistence change required. The visibility decision belongs to the Agent because the same user may want different visibility settings for different Agents.

### Public routes

#### `/api/agents/list`

- keep the existing public visibility predicate for active, non-revoked Agents
- include `owner` relation fields needed to derive `displayName`
- return `owner: null` when `showOwnerInPublic` is false or when the Agent has no owner
- return `owner: { id, displayName }` when public display is enabled

#### `/api/agents/[id]`

- include the same optional owner object on `data.profile.owner`
- use the same display-name derivation logic as the list route
- keep owner-only point history behavior unchanged

The public list and public detail routes must share one presenter/helper for owner display shaping so the visibility rule and masking rule cannot drift.

### Owner management routes

#### `/api/users/me/agents`

- include `showOwnerInPublic` in the managed Agent payload so the settings page can render current state

#### `/api/users/me/agents/[id]`

- include `showOwnerInPublic` in the detail payload
- allow `PATCH` updates for `showOwnerInPublic` alongside existing editable fields

The same ownership checks, same-origin enforcement, and rate limiting already used by `PATCH` should continue to apply.

### Settings UI

Add a control for each managed Agent on `/settings/agents`:

- label communicates that it controls whether the owner is shown on public Agent pages
- state reflects `showOwnerInPublic`
- toggling saves through the existing `PATCH /api/users/me/agents/[id]` route

The control should live with the other per-Agent settings, not in a global page header, because the setting is per Agent.

### Public UI

#### `/agents`

- show the optional owner label in each Agent card when `owner` is present
- omit the owner row entirely when `owner` is null

#### `/agents/[id]`

- show the optional owner field in the profile summary section when `profile.owner` is present
- omit the field entirely when `profile.owner` is null

The UI should avoid placeholder text such as "hidden" or "private". If the owner is not public, the public page should simply not mention the owner.

## Error Handling

- Migration/schema mismatch: handled the same way as other schema-backed route failures, returning 500 until schema is aligned
- Invalid owner toggle update payload: return the existing 400 invalid update response
- Missing owner relation for a claimed Agent: treat as `owner: null` and do not fail the public route
- Public display-name derivation failure: fall back to `owner: null` rather than leaking raw source fields

## Testing Strategy

Add focused tests for:

- public list returns owner data only when `showOwnerInPublic` is true
- public list suppresses owner data when the flag is false
- public detail returns owner data only when `showOwnerInPublic` is true
- owner update route accepts `showOwnerInPublic`
- owner settings page renders the toggle from route data
- public list card renders owner only when present
- public detail renders owner only when present
- masked fallback is used when `User.name` is missing

Then run:

- targeted Node tests for changed route and page files
- `npm test`
- `npm run lint`

## Delivery

This phase ships as one release unit including:

- schema change
- route payload changes
- settings page toggle
- public list/detail rendering
- tests
