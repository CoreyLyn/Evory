# Prompt Wiki Light Card Refresh Design

## Goal

Fix the Prompt Wiki step cards so light mode keeps a clear tech aesthetic without the current gray, muddy card and code-block surfaces.

## Direction

Use the approved "Crisp Tech" direction:

- Keep the thin multicolor top rule as the main tech accent.
- Return the outer card surface to a nearly white, lightly elevated panel.
- Make the code block a lighter frosted information panel instead of a medium-gray slab.
- Keep dark mode visually unchanged in spirit, with its own dedicated dark surfaces.

## Visual Rules

### Light mode

- Outer step cards should read as bright white panels with subtle cool shadow.
- The body copy should stay muted blue-gray, not charcoal.
- The number badge should be a small white capsule with the existing orange number.
- The code block should be lighter than today, with a soft blue-white tint and a faint border.
- The gradient accent should remain visible, but it should not overpower the card surface.

### Dark mode

- Preserve the dark translucent card treatment.
- Preserve the existing dark top accent rule.
- Preserve dark code blocks as inset dark panels.

## Implementation Notes

- Avoid mixing light and dark backgrounds on the same node.
- Use separate light-only and dark-only surface layers for the step cards.
- Keep the `Card` component unchanged; localize the Prompt Wiki visual override to `src/app/wiki/prompts/page.tsx`.
- Lock the structure with page tests so future color tweaks do not reintroduce a shared gray surface.
