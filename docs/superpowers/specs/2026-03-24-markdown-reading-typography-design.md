# Markdown Reading Typography Design

## Summary

Improve Markdown reading typography for forum posts and replies, knowledge-base documents, and task descriptions so Chinese-heavy content reads consistently without weakening the existing Evory brand shell.

## Problem Statement

The current implementation mixes two separate issues:

- `MarkdownContent` intends to rely on `prose` / `prose-*` typography classes, but the project does not ship Tailwind Typography, so those rules do not materialize in compiled CSS.
- The app-level font stack is optimized for Latin-branding and general UI (`Syne` + `Outfit`), while the forum, knowledge base, and tasks are long-form reading surfaces with substantial Chinese content.

That leads to three concrete reading problems:

- Markdown typography is only partially controlled; several intended heading/code/body rules are effectively inert.
- Chinese text falls back to system fonts while Latin characters use `Outfit`, creating visible texture shifts in mixed-language paragraphs.
- Brand-display typography is too aggressive for Markdown-internal headings, especially inside knowledge and task content where structure matters more than personality.

## Goals

- Keep Evory's page-shell branding intact.
- Create a dedicated reading typography layer for Markdown content.
- Improve Chinese and mixed-language readability across forum, knowledge, and tasks.
- Make Markdown styling explicit inside the shared renderer instead of depending on missing typography plugin output.
- Keep code typography stable and explicit.

## Non-Goals

- Rebranding the whole product
- Replacing page-level titles, nav labels, buttons, badges, or other general UI typography
- Introducing downloadable CJK web fonts in this pass
- Changing Markdown parsing or feature support

## Chosen Approach

Use four typography layers:

1. Brand layer: `Syne` for site identity and page-level hero/title moments
2. Application layer: `Outfit` for regular UI
3. Reading layer: a Chinese-friendly system font stack for Markdown reading surfaces
4. Code layer: explicit monospace for inline and block code

The reading layer applies only inside `MarkdownContent`, which remains the shared renderer for forum, knowledge, and tasks. Page-level titles stay unchanged.

## Reading-Layer Font Strategy

The reading layer should prefer stable platform-native Chinese sans fonts and only then fall back to generic UI fonts. Recommended stack:

`-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Segoe UI", sans-serif`

Why:

- It avoids shipping heavy webfont payload for long-form pages.
- Chinese glyph quality is handled by the host platform instead of a Latin-first webfont.
- It reduces the visual split between Chinese body text and Chinese headings.

## Surface Mapping

### Forum

- Keep the post-page title as display typography.
- Move post body and reply body Markdown into the reading layer.
- Keep badges, timestamps, author labels, and discovery cards on application typography.

### Knowledge Base

- Keep the document page title as display typography.
- Render document body and directory landing Markdown in the reading layer.
- Keep breadcrumbs, TOC, search results, directory/document cards, and tags on application typography.

### Tasks

- Keep the task title as display typography.
- Render task descriptions in the reading layer.
- Also render long-form review feedback in the reading layer when shown inline with the task description.
- Keep status, bounty, workflow steps, and metadata on application typography.

## Styling Strategy

- Stop depending on `prose` and `prose-*` selectors for font ownership.
- Add explicit class ownership in `MarkdownContent` for:
  - root reading font stack
  - heading font family
  - body spacing and line height
  - inline code and code block font family
  - table, blockquote, and link presentation
- Keep page-level layout concerns outside the component.

## Title and Heading Rules

- Page-level titles remain `font-display`.
- Markdown-internal `h1` through `h6` switch to the reading layer instead of display typography.
- Heading hierarchy remains driven by spacing, size, weight, and letter spacing rather than a display face.

This preserves brand moments without letting Markdown content drift into editorial-poster styling.

## Risks and Mitigations

### Risk: Reading typography change spills into non-Markdown UI

Mitigation:

- Apply the new reading font stack only through `MarkdownContent`.

### Risk: Existing tests only check structural rendering, not typography ownership

Mitigation:

- Add focused renderer tests for reading-layer and code-layer class output.

### Risk: Review surfaces still feel split if review comments stay on app typography

Mitigation:

- Treat long-form review feedback as reading content on the task detail page.

## Implementation Readiness

This work is ready for implementation. It is narrowly scoped to Markdown reading surfaces, reuses the existing shared renderer, and can be validated with targeted renderer tests plus light page-level regression coverage.
