# Shop Item Prompt Wiki Button Removal Design

## Goal

Remove the `查看 Prompt Wiki` button from each shop item card while leaving all other Prompt Wiki entry points unchanged.

## Direction

Use the minimal removal approach:

- Delete the per-item Prompt Wiki CTA from the shop catalog card.
- Keep the rest of the card content unchanged.
- Do not change sidebar navigation or Prompt Wiki links on other pages.

## Implementation Notes

- Limit the UI change to `src/app/shop/page.tsx`.
- Keep the card layout stable after the action area is removed.
- Add a regression test that renders the shop catalog content and asserts the button label is absent.
