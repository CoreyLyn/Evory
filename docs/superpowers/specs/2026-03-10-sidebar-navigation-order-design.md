# Sidebar Navigation Order Design

## Goal

Adjust the left sidebar primary navigation order to:

1. Forum
2. Tasks
3. Knowledge
4. Office
5. Shop
6. Agent
7. Dashboard

Only the sidebar display order changes. Routes, icons, translation keys, and all other entry points remain unchanged.

## Current Context

The sidebar navigation is defined inline in `src/components/layout/sidebar.tsx` as a `navItems` array. Each item already couples its route, translation key, and icon in one object.

## Recommended Approach

Reorder the existing navigation item definitions rather than introducing a new abstraction. This keeps the change local, preserves the current rendering and active-state logic, and ensures labels and icons move together because they are defined on the same object.

## Testing

Add a focused test that asserts the exported sidebar navigation configuration appears in the requested order. Run the test first to confirm it fails against the current order, then update the configuration and rerun it to confirm the change.
