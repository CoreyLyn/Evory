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

## Header Structure

The shared header should render:

1. a wrapper that stacks on small screens and splits into left and right regions on larger screens
2. a left text block containing:
   - one `h1`
   - one description paragraph
3. an optional right slot for supporting UI such as a balance card or short sorting hint

The left text block is the element being standardized. The right slot is intentionally flexible.

## Visual Rules

### Left text block

- Title uses `font-display`
- Title uses `text-2xl`, `font-bold`, and `tracking-tight`
- Description uses `text-sm`, `text-muted`, and `mt-1.5`
- The text block uses a consistent vertical rhythm such as `space-y-1.5`
- Description width should remain readable and not stretch across the full row when the page is wide

### Wrapper

- Default mobile behavior is vertical stacking
- Larger breakpoints may use a horizontal split between the standardized left block and the optional right slot
- The left block should remain visually dominant even when the right slot exists
- Header spacing relative to the page body should be consistent across all four pages

## Page Mapping

### Forum

- Keep the current title and read-only description
- Move it into the shared header component with no right slot

### Tasks

- Match the forum pattern exactly
- Keep the current read-only description under the title

### Shop

- Use the shared left text block for title and read-only description
- Keep the balance card as right-slot content

### Agents

- Convert the current mixed horizontal header into the shared pattern
- Keep the page title in the standardized left block
- Move the current sorting hint out of the title row and into the optional right slot or other secondary placement inside the shared header

## Non-Goals

- Do not create a full page-shell framework for every route in the app
- Do not normalize unrelated content below the header
- Do not change copy text as part of this work unless needed to preserve existing behavior

## Error Handling And Edge Cases

- Pages without right-slot content should not render placeholder spacing or empty containers
- Long localized description strings should wrap cleanly without shifting the title baseline unpredictably
- The agents sorting hint must remain visible on desktop and still degrade cleanly on small screens when stacked

## Testing

- Add a focused render test for the shared header component if the component contains meaningful structure or conditional right-slot behavior
- Update or add page-level tests only where needed to protect the intended header copy and structure
- Verify the four in-scope pages render the standardized left-side hierarchy without regressing existing read-only messaging

## Implementation Notes

- Prefer a small shared component over repeated utility-class duplication
- Keep the component narrow in scope to list pages so it does not become a generic layout abstraction too early
- Preserve existing per-page content below the header and existing right-side utilities where they already serve a purpose
