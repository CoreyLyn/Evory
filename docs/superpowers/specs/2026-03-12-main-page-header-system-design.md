# Main Page Header System Design

## Goal

Unify the page-header treatment across the seven primary product pages so the app no longer mixes multiple unrelated title, subtitle, and alignment patterns.

The target pages are:

- `src/app/forum/page.tsx`
- `src/app/tasks/page.tsx`
- `src/app/knowledge/page.tsx`
- `src/app/office/page.tsx`
- `src/app/shop/page.tsx`
- `src/app/agents/page.tsx`
- `src/app/dashboard/page.tsx`

## Current Problem

The main product pages currently split across multiple incompatible header patterns:

- forum uses a narrower content container than the other list pages, so its title block starts further to the right
- tasks, shop, and agents already share most typography but still rely on ad hoc page wiring
- knowledge has only a title and no subtitle, so its hierarchy is incomplete
- office and dashboard use larger title systems than the list pages, but they are not formally grouped as a separate variant

This makes the app feel inconsistent even when the navigation treats these pages as first-class peers.

## Recommended Approach

Use one shared header system with two explicit variants:

1. a `list` variant for list and directory-style pages
2. an `overview` variant for high-level visual or summary pages

This keeps the app consistent without forcing pages with different information density into one identical visual treatment.

## Page Classification

### List variant

- `src/app/forum/page.tsx`
- `src/app/tasks/page.tsx`
- `src/app/knowledge/page.tsx`
- `src/app/shop/page.tsx`
- `src/app/agents/page.tsx`

### Overview variant

- `src/app/office/page.tsx`
- `src/app/dashboard/page.tsx`

## Shared Component Contract

The header system should remain a narrow layout primitive.

Required props:

- `title`
- `description`

Optional props:

- `rightSlot`
- `variant`

Contract rules:

- `variant` accepts only `list` or `overview`
- the component owns typography, internal spacing, and breakpoint behavior
- the component does not own page-specific outer margin
- the component renders the right slot only when meaningful content is provided
- pages own any route-specific outer spacing and container width decisions
- `rightSlot` is supported for both variants, but overview pages should use it only for lightweight support content, not large metric grids or canvas-adjacent UI

## Variant Rules

### List variant

Used for browseable content pages.

- Title uses `font-display`, `text-2xl`, `font-bold`, `tracking-tight`
- Subtitle uses `text-sm`
- Left alignment and subtitle width should match across all five list pages
- A right slot is optional and should be used for lightweight utility content such as sort hints, search controls, or balance summary

### Overview variant

Used for pages that behave more like a control-room or summary surface.

- Title uses `font-display`, `text-3xl`, `font-bold`, and `tracking-tight`
- Subtitle uses `text-base`
- Title color and weight treatment should match between office and dashboard; the variant standardizes typography and color treatment, not just size
- Office and dashboard must use the same title and subtitle scale
- The pages may still differ below the header, but the header hierarchy itself should match

## Page Mapping

### Forum

- Move the page onto the `list` variant
- Remove the narrower header alignment created by the `max-w-4xl` shell so the title block aligns with the other list pages
- Keep the existing read-only subtitle copy

### Tasks

- Keep the page on the `list` variant
- Preserve the current read-only subtitle copy

### Knowledge

- Move the page onto the `list` variant
- Add a subtitle under the title
- Keep the existing search control in the header row as right-slot content

### Shop

- Keep the page on the `list` variant
- Preserve the current read-only subtitle copy
- Keep the balance summary card as right-slot content

### Agents

- Keep the page on the `list` variant
- Preserve the current subtitle and sort hint structure

### Office

- Move the page onto the `overview` variant
- Preserve the current page purpose and supporting copy, but normalize title/subtitle scale to match dashboard
- Keep any stats, legend, or canvas controls outside the shared header unless they are lightweight enough to fit the existing `rightSlot` pattern cleanly

### Dashboard

- Keep the page as an `overview` variant
- Normalize its title/subtitle scale so it matches office

## New Copy Requirements

Add a new knowledge subtitle key named `knowledge.subtitle`.

Use explicit copy:

- `zh`: `公开文章、经验总结与操作记录都汇总在这里，支持搜索与浏览。`
- `en`: `Browse public articles, runbooks, and shared learnings from across the platform.`

## Non-Goals

- Do not redesign cards, filters, grids, charts, or the office canvas itself
- Do not touch settings pages or detail pages in this pass
- Do not create more than the two approved variants

## Error Handling And Edge Cases

- A page with no right-side support content must not render an empty right-slot wrapper
- Search or summary content passed as right-slot content must wrap cleanly on smaller screens
- The list variant must not reintroduce page-specific left-offset drift like the current forum page
- The overview variant must not diverge into two separate scales for office and dashboard

## Testing

- Extend the focused header tests to cover the new `variant` behavior
- Add or update page-level tests so:
  - forum alignment no longer uses a narrower header shell than the other list pages
  - knowledge renders the new subtitle
  - shop and agents keep their right-slot support content
  - office and dashboard share the same overview variant scale
- Keep page tests focused on observable structure and copy rather than broad snapshots

## Implementation Notes

- Prefer evolving the existing `PageHeader` component instead of adding a second unrelated component
- Keep the two variants explicit in code so future pages cannot drift into undocumented header styles
- If a page needs unusual outer spacing, handle it in the page file rather than growing the shared component API
