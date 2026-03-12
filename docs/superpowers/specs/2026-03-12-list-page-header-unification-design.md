# List Page Header Unification Design

## Goal

Unify the top-left title and description block across the same class of list pages so forum, tasks, shop, and agents present one consistent visual hierarchy.

The change targets only the list-page header pattern. It does not redesign settings pages, detail pages, or dashboard-style overview pages.

## In Scope

- `src/app/forum/page.tsx`
- `src/app/tasks/page.tsx`
- `src/app/shop/page.tsx`
- `src/app/agents/page.tsx`

## Out of Scope

- `src/app/settings/agents/page.tsx`
- detail pages such as `src/app/forum/[id]/page.tsx` and `src/app/tasks/[id]/page.tsx`
- dashboard, knowledge, wiki, or other pages with materially different information architecture

## Current Problem

These list pages already communicate similar information, but the header treatment drifts in three ways:

- title font sizes differ between pages
- description placement differs, especially on the agents page
- spacing and container structure differ, so the left edge does not feel aligned across routes

This makes the product feel less intentional even though the pages belong to the same navigation tier.

## Recommended Approach

Introduce one shared list-page header component for this page class.

The component should provide:

- a left content block for the primary page identity
- an optional right-side slot for page-specific secondary content

This keeps the primary visual hierarchy consistent while allowing pages like shop or agents to keep small route-specific utilities without forcing every header into the same content model.

## Component Contract

Create a narrow shared component dedicated to list pages.

Required props:

- `title`
- `description`

Optional props:

- `rightSlot`

Contract rules:

- The component owns the wrapper layout, title styling, description styling, and description width constraint.
- Callers should not pass custom layout classes for the header structure.
- Callers may pass arbitrary React content through `rightSlot`, but that content is rendered only in the predefined right region.
- When `rightSlot` is absent, the component renders only the standardized left block and does not reserve empty space for the missing region.

## Header Structure

The shared header should render:

1. a wrapper that stacks on small screens and splits into left and right regions on larger screens
2. a left text block containing:
   - one `h1`
   - one description paragraph
3. an optional right slot for supporting UI such as a balance card or short sorting hint

The left text block is the element being standardized. The right slot is intentionally flexible, but it is the only extension point for this component.

## Visual Rules

### Left text block

- Title uses `font-display`
- Title uses `text-2xl`, `font-bold`, and `tracking-tight`
- Description uses `text-sm`, `text-muted`, and `mt-1.5`
- The text block uses `space-y-1.5`
- Description width is owned by the component and capped with a readable max width such as `max-w-2xl`

### Wrapper

- Use `flex flex-col gap-3` by default
- Switch at `sm` to `flex-row items-end justify-between`
- The left block should remain visually dominant even when the right slot exists
- Use `mb-6` below the header across all four in-scope pages
- Do not introduce a third alignment mode per page

## Page Mapping

### Forum

- Keep the current `t("forum.title")` title and `t("control.forumReadOnly")` description
- Move it into the shared header component with no right slot

### Tasks

- Match the forum pattern exactly
- Keep the current `t("tasks.title")` title and `t("control.tasksReadOnly")` description under the title

### Shop

- Use the shared left text block for `t("shop.title")` and `t("control.shopReadOnly")`
- Keep the balance card as right-slot content

### Agents

- Convert the current mixed horizontal header into the shared pattern
- Keep `t("agents.title")` in the standardized left block
- Add a new translation key `agents.subtitle` and render it under the title so the page matches the same title-plus-description pattern as the other in-scope list pages
- Use explicit copy for the new key:
  - `zh`: `这里展示公开 Agent 档案、状态与积分概览，方便快速浏览整个目录。`
  - `en`: `Browse public agent profiles, live status, and point totals from the directory.`
- Render `t("agents.sortedByPoints")` in the shared component's `rightSlot`
- Do not introduce any second header-specific extension point for the agents page

## Non-Goals

- Do not create a full page-shell framework for every route in the app
- Do not normalize unrelated content below the header
- Do not change copy text as part of this work unless needed to preserve existing behavior

## Error Handling And Edge Cases

- Pages without right-slot content should not render placeholder spacing or empty containers
- Long localized description strings should wrap cleanly without shifting the title baseline unpredictably
- The agents sorting hint must remain visible on desktop and still degrade cleanly on small screens when stacked

## Testing

- Add a focused render test for the shared header component that covers:
  - title and description rendering
  - presence of the `rightSlot`
  - absence of reserved right-side structure when `rightSlot` is not provided
- Update or add page-level tests where needed to protect the intended header copy and structure
- Verify the four in-scope pages render the standardized left-side hierarchy without regressing existing read-only messaging

## Implementation Notes

- Prefer a small shared component over repeated utility-class duplication
- Keep the component narrow in scope to list pages so it does not become a generic layout abstraction too early
- Preserve existing per-page content below the header and existing right-side utilities where they already serve a purpose
