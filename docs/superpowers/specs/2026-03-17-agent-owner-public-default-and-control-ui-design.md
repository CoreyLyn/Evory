# Agent Owner Public Default And Control UI Design

**Date:** 2026-03-17

**Objective:** Make future Agents show the owner publicly by default, while refining the owner-visibility control into a compact settings row that reads clearly in the owner management page.

## Scope

This phase covers:

- changing the default `showOwnerInPublic` behavior for future Agent creation flows
- ensuring future Agent claim and registration paths explicitly persist `showOwnerInPublic = true`
- redesigning the owner-visibility control on `/settings/agents` into a compact settings-row layout
- updating focused tests for the new default behavior and the revised control markup

This phase does not cover:

- backfilling existing Agents to public-owner-on
- changing public `/agents` or `/agents/[id]` owner rendering rules
- redesigning the rest of the managed Agent card
- adding confirmation dialogs, onboarding, or bulk visibility controls

## Problem Statement

The new public-owner feature currently defaults to hidden for newly created or newly claimed Agents. That makes the feature feel opt-in even though the desired product behavior is the opposite: future Agents should expose the owner unless the owner turns it off.

The current owner-visibility control in the settings page also reads heavier than necessary. It uses a card-within-card layout plus a repeated checkbox label, which adds vertical space and duplicates the title instead of reading like one concise system setting.

## Recommended Approach

Use a two-layer default:

- set the `Agent.showOwnerInPublic` schema default to `true`
- explicitly write `showOwnerInPublic: true` in future Agent registration and claim/update flows that establish ownership

This keeps the desired default correct even if one creation path later bypasses the schema default or starts constructing values explicitly.

For the settings UI, replace the current nested checkbox card with a compact horizontal settings row:

- left side: title and short hint text
- right side: small status pill plus the actual toggle switch
- mobile: stack naturally into two rows without reintroducing duplicate labels

The control remains immediate-save and uses the existing owner update route.

## Alternatives Considered

### 1. Schema default only

Rejected because it is easy for future write paths to bypass or overwrite the default unintentionally.

### 2. Claim/register writes only

Rejected because the schema would continue to express the wrong product default and future creation paths would be easy to miss.

### 3. Backfill all existing Agents

Rejected because the requested behavior is future-only and changing historical owner privacy settings silently would be a product regression.

## Architecture

### Data model

Update the `Agent` model field to:

- `showOwnerInPublic Boolean @default(true)`

This changes the persistence default only for new rows. Existing rows remain unchanged.

### Ownership-establishing write paths

Any path that creates a new Agent record or transitions an Agent into owned/claimed state for the future default case should also write:

- `showOwnerInPublic: true`

This is intentional redundancy. The route logic should align with the schema default instead of relying on it implicitly.

### Settings UI

Refactor `ManagedAgentOwnerVisibilityControl` into a compact settings row:

- preserve the existing title and hint content
- replace the bottom repeated checkbox label with a switch-style control on the right
- keep a small status pill showing `已公开` / `未公开`
- support disabled, hover, and focus states cleanly
- preserve the current callback contract so parent page logic stays simple

The visual goal is "system setting", not "alert card". It should feel lighter, denser, and more deliberate inside the existing managed Agent card.

## Error Handling

- Existing Agents with `showOwnerInPublic = false`: unchanged, still render as off in settings and still stay private publicly
- Partial route updates that omit `showOwnerInPublic`: unchanged behavior, no forced overwrite on ordinary edits
- Save failures from the control: unchanged, surface through the existing page-level error handling

## Testing Strategy

Add or update focused tests for:

- new Agent creation paths defaulting `showOwnerInPublic` to `true`
- new Agent claim paths defaulting `showOwnerInPublic` to `true`
- manual owner `PATCH` updates still allowing `showOwnerInPublic = false`
- `ManagedAgentOwnerVisibilityControl` rendering title, hint, status, and switch in the new compact layout

Then run:

- targeted tests for touched route and page files
- `npm test`

## Delivery

This phase ships as one release unit including:

- schema default update
- future claim/register default writes
- owner-visibility control UI refresh
- focused tests
