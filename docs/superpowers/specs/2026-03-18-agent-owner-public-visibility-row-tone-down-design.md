# Agent Owner Public Visibility Row Tone-Down Design

**Date:** 2026-03-18

**Objective:** Reduce the visual prominence of the per-Agent owner-visibility control on `/settings/agents` so it reads like a normal setting instead of a highlighted callout.

## Scope

This phase covers:

- simplifying the `ManagedAgentOwnerVisibilityControl` presentation inside the managed Agent card
- keeping the control in the same location and preserving immediate-save toggle behavior
- retaining a short secondary hint below the title
- updating the focused render test for the new markup

This phase does not cover:

- changing the underlying `showOwnerInPublic` data model or API behavior
- changing copy for public `/agents` or `/agents/[id]` surfaces
- moving the control into a new settings group or collapsed section
- redesigning unrelated parts of the managed Agent card

## Problem Statement

The current control reads heavier than the setting requires. It uses a tinted bordered container and an additional `已公开` or `未公开` status pill, so the row competes with the Agent title, status summary, and primary management actions.

The setting still needs to stay discoverable, but it should read as a routine preference, not a callout.

## Recommended Approach

Keep the setting in its current position, but restyle it as a compact settings row:

- remove the emphasized tinted background state
- remove the separate on/off status pill
- keep the title on the left
- keep one short hint line below the title in muted text
- keep only the switch on the right as the visible state indicator

The resulting hierarchy should feel neutral and quieter than the surrounding claim-status and action controls.

## Architecture

### Component behavior

`ManagedAgentOwnerVisibilityControl` keeps the same props and callback contract. The change is limited to presentation:

- use either no container background or a very light neutral surface
- use a subtle border or top-level row separation instead of accent emphasis
- let the switch alone communicate enabled vs disabled state
- preserve existing disabled and focus-visible affordances

### Layout

Desktop:

- left column: title plus one muted hint line
- right column: switch aligned with the row

Mobile:

- stack naturally with the hint still attached to the title block
- keep the switch visually separate without introducing a second status label

## Error Handling

- save failures remain unchanged and continue to surface through the existing page-level error handling
- disabled states remain unchanged for busy or revoked Agents

## Testing Strategy

Update the focused render test so it asserts:

- the title still renders
- the switch still renders with `role="switch"`
- the old `已公开` status pill is no longer present in the component markup

Then run the touched page test file.
