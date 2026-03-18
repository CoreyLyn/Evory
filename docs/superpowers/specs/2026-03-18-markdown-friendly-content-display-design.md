# Markdown-Friendly Content Display Design

## Summary

Improve Markdown rendering in Evory's read-only web surfaces so forum post detail, forum replies, task detail descriptions, and knowledge base documents all render through the same safe Markdown pipeline. List pages remain summary-first and do not attempt rich Markdown previews.

## Current State

- Knowledge base document views already use `react-markdown` with `remark-gfm`, but the rendering setup is duplicated across two components and the typography is only lightly tuned.
- Forum post detail and reply content are currently rendered as plain text with `whitespace-pre-wrap`, so Markdown syntax is shown literally instead of being interpreted.
- Task detail descriptions are also rendered as plain text with `whitespace-pre-wrap`.
- Forum and task list pages show summary snippets; changing those surfaces is out of scope for this work.

## Goals

- Render Markdown consistently across the four approved detail surfaces:
  - Forum post body
  - Forum reply body
  - Task description
  - Knowledge base document body, including directory landing documents
- Reuse one shared rendering component so Markdown rules and styling stay aligned.
- Support the same safe Markdown feature set everywhere.
- Preserve current list-page behavior as plain summary previews.

## Non-Goals

- Adding a Markdown editor, toolbar, or authoring hints
- Converting forum/task list cards into rich Markdown previews
- Executing embedded HTML, scripts, or raw iframe/style content from Markdown
- Adding syntax highlighting, heading anchors, table-of-contents generation, or copy buttons in this pass

## Chosen Approach

Create a shared `MarkdownContent` presentation component under `src/components/content/` and migrate all detail-body rendering to it.

Why this approach:

- It fits the current codebase: the project already ships `react-markdown` and `remark-gfm`.
- It removes duplicated Markdown setup in the knowledge base views.
- It upgrades forum/task detail rendering without introducing a heavier parsing layer than the request needs.
- It keeps future enhancements localized to one component.

## Alternatives Considered

### 1. Parse Markdown into a shared intermediate format in the data layer

This would centralize formatting rules even further and could help with future search snippets, but it is heavier than needed for the current detail-page-only scope and would spread the change across API/data boundaries.

### 2. Build a more advanced document rendering pipeline now

This could add syntax highlighting, heading anchors, and a generated table of contents, but those additions are not part of the request and would increase implementation and maintenance cost.

## Rendering Rules

The shared renderer will support these Markdown constructs everywhere:

- Headings (`#` through `######`)
- Paragraphs and standard line breaks
- Ordered and unordered lists, including nesting
- Blockquotes
- Inline code and fenced code blocks
- GFM tables
- GFM task lists
- Horizontal rules
- Links

Safety rules:

- Do not enable raw HTML rendering from Markdown.
- Do not introduce `rehype-raw`.
- Treat unsupported syntax as regular text rather than failing.
- Keep task-list checkboxes read-only in the rendered output.

## Display Behavior

The shared renderer should provide one consistent reading experience across forum, tasks, and knowledge:

- Headings have clear visual hierarchy relative to body text.
- Code blocks use a distinct container with rounded corners and horizontal scrolling.
- Inline code is visually separated from surrounding prose.
- Tables can scroll horizontally on narrow screens instead of breaking layout.
- Blockquotes use a visible accent border and subdued background.
- Links are visibly interactive; external links should open in a new tab with safe rel attributes.
- Body content should remain readable inside existing cards and not stretch into an overly wide text column.

## Component Design

### Shared Component

Add a component similar to:

```tsx
type MarkdownContentProps = {
  content: string;
  className?: string;
  variant?: "default" | "compact";
};
```

Responsibilities:

- Own the `react-markdown` + `remark-gfm` integration
- Define the safe rendering defaults
- Define shared typography and element-level styling
- Map links, tables, code, blockquotes, and list elements to the desired UI output

Non-responsibilities:

- Fetching content
- Truncating content for list cards
- Business logic specific to forum/tasks/knowledge

### Integration Points

- `src/app/forum/[id]/page.tsx`
  - Render the post body with `MarkdownContent`
  - Render each reply body with `MarkdownContent`
- `src/app/tasks/[id]/page.tsx`
  - Render `task.description` with `MarkdownContent`
- `src/components/knowledge/knowledge-document-view.tsx`
  - Replace the inline `ReactMarkdown` usage with `MarkdownContent`
- `src/components/knowledge/knowledge-directory-view.tsx`
  - Replace the inline `ReactMarkdown` usage with `MarkdownContent`

## Styling Plan

- Move Markdown typography ownership into the shared component instead of duplicating `prose` wrappers per feature.
- Keep page-level layout concerns where they are now: cards, metadata rows, spacing between sections, and navigation controls stay in their current page/view components.
- Remove the current plain-text-only `whitespace-pre-wrap` rendering from forum/task detail bodies so Markdown formatting can flow naturally.
- Keep the styling implementation compatible with the current theme tokens and card surfaces.

## Testing Plan

### Shared Renderer Tests

Add focused tests for the shared component covering:

- Headings
- Nested lists
- Blockquotes
- Inline code
- Fenced code blocks
- GFM tables
- GFM task lists
- Links

### Feature Regression Tests

Update or add page/component tests to verify:

- Forum detail renders Markdown content for the post body
- Forum detail renders Markdown content for reply bodies
- Task detail renders Markdown content for the description
- Knowledge document and directory landing views still render Markdown through the shared component

### Scope Guard Tests

Retain list-page expectations so forum/task lists remain summary-only and do not expand into full Markdown rendering.

## Risks and Mitigations

### Risk: Existing tests assume plain-text DOM structure

Mitigation:

- Update assertions to target rendered semantic content instead of `whitespace-pre-wrap` implementation details.

### Risk: Shared prose styles may not match all current surfaces on first pass

Mitigation:

- Keep styling localized to the shared component and tune code blocks, tables, and blockquotes against current theme tokens during implementation.

## Open Questions Resolved

- Scope is detail pages only; list pages remain summary-first.
- Forum post body, forum replies, task descriptions, and knowledge bodies all use the same Markdown capability set.
- The renderer should prefer safe Markdown and must not execute embedded HTML.

## Implementation Readiness

This work is ready for implementation planning. It is scoped to a single coherent UI/content rendering change, avoids unrelated refactors, and keeps future upgrades possible through one shared component.
