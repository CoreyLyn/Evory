# Forum UI Information Hierarchy Design

## Scope

This design covers the forum reading experience in the current read-only mode:

- Forum home page structure
- Post list card hierarchy
- Post detail page hierarchy
- Featured-post selection rules

This design does not cover:

- Writing, replying, or moderation flows
- API contract changes for posting interactions
- Full visual rebranding beyond the forum surfaces

## Problem Statement

The current forum UI is functionally complete but still reads like a generic card list rather than a knowledge-focused community surface.

Observed issues in the current implementation:

- The home page lacks a strong first-screen structure. Title, category filters, search, and tags are present, but they do not form a clear reading and discovery flow.
- The post list cards place title, metadata, tags, and counters at roughly the same visual priority, which weakens scanability.
- The detail page presents the main post and replies as similarly weighted stacked cards, so the reading experience and the discussion experience are not clearly separated.
- The forum is read-only, but the current UI still spends valuable above-the-fold space on state and structure that do not reinforce content quality.
- A heavy featured section would overtake the primary content flow, while having no featured signal at all would make the forum feel flat.

The product direction confirmed during brainstorming is:

- Knowledge community / technical forum tone
- Home page should combine curation and recency
- The forum remains read-only
- Quality signals should be stronger than activity signals
- Featured content should be lightweight, not dominant

## Approaches Considered

### Approach A: Dedicated featured section above the list

Use a separate hero-style featured area followed by the normal post list.

Pros:

- Strong editorial framing
- Makes high-quality content immediately visible

Cons:

- Visually heavy for a read-only forum
- Competes with the main post list
- Requires stronger curation discipline to avoid homepage bloat

### Approach B: Pure chronological list with no featured treatment

Show only filters and a standard latest-post feed.

Pros:

- Simplest structure
- Low implementation cost

Cons:

- Weak sense of editorial quality
- Home page feels utilitarian rather than intentional

### Approach C: Featured posts integrated into the list

Keep the homepage list-first, but give selected posts a stronger in-list presentation.

Pros:

- Preserves reading flow
- Adds quality signals without a heavy homepage block
- Fits the current read-only product state

Cons:

- Editorial identity is subtler than a separate featured section
- Requires card hierarchy to be designed carefully

## Recommended Approach

Adopt a list-first homepage with lightweight featured treatment inside the main list.

This keeps the forum centered on reading while still signaling that some posts are especially worth opening. The page should feel like a curated knowledge stream rather than a feed app or a blog landing page.

The resulting design decisions are:

- Use a home page structure derived from the previously discussed “featured + latest” concept, but reduce the featured treatment to an in-list pattern instead of a separate heavyweight module.
- Use summary-first post cards so users judge post quality from title and excerpt before looking at engagement counters.
- Use an article-first detail page where the main post reads like a primary document and replies read like a secondary discussion stream.
- Keep interaction signals visible but subordinate to reading signals.

## Architecture

### Home Page Structure

The forum home page should be reorganized into five layers:

1. Page header
2. Unified filter bar
3. Post list with lightweight featured cards
4. Empty/error/loading states
5. Pagination

#### 1. Page header

The top of the page should communicate what the forum is for, not only that it is read-only.

Recommended contents:

- Forum title
- Short description focused on knowledge-sharing value
- Search input in the first screen

The current “read-only” status should remain visible, but only as supporting copy rather than the defining headline message.

#### 2. Unified filter bar

Category tabs, tag context, result count, and filter reset should be grouped into a single control band.

Recommended contents:

- Category tabs
- Selected-tag summary
- Result count
- Clear-filters action

This reduces the fragmented feeling caused by separated title, categories, search, and tags.

#### 3. Post list with lightweight featured cards

The main browsing surface remains a continuous latest-post list. Featured posts are not rendered in a separate hero block. Instead, selected posts receive stronger presentation in the list through one or more of:

- Featured label
- Slightly larger title and excerpt spacing
- More prominent summary block
- Stronger border or background contrast

This keeps the home page content-first while preserving a sense of curation.

#### 4. Empty, error, and loading states

The page should use forum-specific states instead of generic utility states.

Recommended behavior:

- Empty state explains whether no posts exist or current filters returned nothing
- Error state offers a retry action
- Loading state uses list skeletons rather than only a text label

#### 5. Pagination

Pagination remains at the bottom of the list and should stay visually separate from filters and featured treatment.

### Post List Card Hierarchy

The chosen direction is summary-first cards.

Each card should follow this order:

1. Featured or category marker
2. Title
3. Two-line summary
4. Author, updated time, and core tags
5. Reply and like counts in a weaker supporting position

This hierarchy gives users the right decision order:

- Is the topic relevant?
- Does the excerpt look substantial?
- Who wrote it and how recent is it?
- Is there meaningful engagement?

Card behavior guidelines:

- Summary should clamp to two lines on desktop and mobile
- Exposed tags should cap at two or three, with overflow summarized
- Engagement counters should not sit at equal visual weight to the title and summary
- Featured cards should feel elevated, but only by one step, not as a separate homepage section

### Post Detail Page Hierarchy

The selected direction is article-first detail pages with a distinct discussion section.

The page should be organized as:

1. Return and location context
2. Main post header
3. Main post body
4. Discussion section heading
5. Reply stream

#### 1. Return and location context

Provide a clear return path to the forum. Breadcrumbs are optional; at minimum, the category or forum context should be visually present.

#### 2. Main post header

The header should present:

- Title
- Author
- Updated time
- Category
- View count
- Tags

Like count can remain visible, but it should not compete with the title.

#### 3. Main post body

The body should read like a primary document. Typography, spacing, and markdown rendering should favor reading continuity rather than dashboard density.

#### 4. Discussion section heading

Replies should begin under a clearly labeled discussion section with reply count.

#### 5. Reply stream

Replies should look like second-level discussion items rather than clones of the main post card.

Recommended reply treatment:

- Lighter card weight than the main post
- Strong author and time metadata
- Compact markdown rendering
- Consistent vertical rhythm

## Featured Post Selection Rules

Featured content should be selected through a hybrid model: simple quality rules plus optional editorial confirmation.

The initial candidate rules should favor quality over raw engagement:

- Published within the last 14 days
- Prioritize `technical` and `discussion` categories
- Require at least one core tag
- Require content length above a minimum threshold
- Use likes, replies, and views as supporting signals rather than primary gates

Recommended scoring direction:

- Content quality: 50%
- Engagement signals: 30%
- Freshness: 20%

Operationally:

- Only a small number of posts should receive featured treatment at once
- Featured status should be visually subtle because it appears inside the list
- A manual override should be available so administrators can pin or remove candidates when needed

## Error Handling

The redesigned hierarchy should anticipate edge states:

- If filters return no results, the page should preserve the active filters and explain that no matching posts were found
- If forum data fails to load, the page should show a retry path instead of only static error text
- If no featured candidates exist, the list should render normally without leaving an empty featured gap

## Testing Strategy

Validation should cover both behavior and presentation logic.

Recommended testing areas:

- Home page renders the unified filter structure correctly
- Featured cards render inside the list without breaking pagination or sorting
- Post cards preserve summary, metadata, and tag hierarchy at different viewport widths
- Detail pages preserve article-first ordering and reply-section separation
- Empty/error/loading states remain readable and actionable
- Accessibility checks confirm that state changes and dynamic result updates are announced appropriately

## Success Criteria

The redesign is successful when:

- The home page feels list-first and knowledge-focused instead of generic
- Featured content is visible without dominating the first screen
- Users can identify title, summary, author, and tags faster than engagement counters
- The detail page makes the main post feel like the primary reading surface
- Replies read as a discussion layer, not as equally weighted peer cards

## Delivery

This design is intended to guide a follow-up implementation plan for forum UI refinement in the current read-only product phase.
