# Canvas Style Optimization Design

Date: 2026-03-15
Status: Draft
Scope: `src/canvas/`, `src/app/office/`

## Problem

The office Canvas UI has 10 style-related issues spanning rendering quality, performance, and maintainability:

- **P0**: Offscreen canvases lack DPR scaling (blurry background on Retina); status dot/badge hex colors duplicated across `agent-sidebar.tsx` and `page.tsx`; canvas glow colors hardcoded inline in `sprites.ts`
- **P1**: Per-frame rgba template string allocation (GC pressure); agent detail card hardcodes slate colors; detail card overlaps status legend on medium screens
- **P2**: Multiple stacked backdrop-blur elements hurt mobile performance; unused CSS transition on canvas element
- **P3**: Only WORKING/POSTING have status glow; manual shadow state resets in zone details; legend opacity flickers on group hover

Note: `dashboard/page.tsx` also has a `STATUS_COLORS` map, but it uses Tailwind class names (`"bg-success"`) rather than hex values. It is intentionally excluded from this refactor since it operates in a different domain (CSS classes vs. canvas hex).

## Approach

**Strategy A (chosen)**: Extract a shared theme module (`src/canvas/theme.ts`) as the single source of truth for colors and fonts, then fix canvas rendering and React component issues in separate passes.

Rejected alternative: in-place fixes without a shared module. Leaves color duplication partially unresolved.

## Design

### 1. Shared Theme Module — `src/canvas/theme.ts`

New file (~40 lines). Contains:

| Export | Type | Purpose |
|--------|------|---------|
| `STATUS_COLORS` | `Record<string, string>` | Hex colors for all 6 statuses (UI dots/badges) |
| `STATUS_GLOW` | `Record<string, { color: string; blur: number } \| null>` | Canvas glow config per status; `null` for OFFLINE |
| `CANVAS_FONTS` | `{ label: string, small: string, hud: string }` | Fixed-size font strings for canvas text |
| `rgbaFromHex(hex, alpha)` | `(string, number) => string` | Cached hex+alpha to rgba string conversion |

`CANVAS_FONTS` covers only fixed-size fonts:
- `label`: `"12px system-ui, -apple-system, sans-serif"` (zone labels, HUD, entrance)
- `small`: `"10px system-ui, -apple-system, sans-serif"` (taskboard column headers — also normalizes the missing `-apple-system`)
- `hud`: same as `label` (alias for readability)

Scale-dependent fonts in `sprites.ts` (`${8*s}px monospace`) and `bubbles.ts` (`${7*s}px system-ui, ...`) remain inline since they depend on the runtime `scale` parameter.

`STATUS_GLOW` encodes both color and blur intensity per status:
- WORKING: `{ color: "#eab308", blur: 12 }` — strong yellow glow
- POSTING: `{ color: "#3b82f6", blur: 10 }` — strong blue glow
- READING: `{ color: "#10b981", blur: 8 }` — moderate green glow
- ONLINE: `{ color: "#22c55e", blur: 8 }` — moderate green glow
- IDLE: `{ color: "#8b5cf6", blur: 6 }` — subtle violet glow
- OFFLINE: `null` — no glow

`rgbaFromHex` uses an internal `Map` cache with FIFO eviction at 128 entries. 128 was chosen to comfortably cover ~8 base colors x ~15 alpha variants observed in the rendering pipeline with room for growth.

**Consumers:**

- `sprites.ts` — imports `STATUS_GLOW`, `rgbaFromHex`
- `office.ts` — imports `CANVAS_FONTS`
- `page.tsx` — imports `STATUS_COLORS`, replaces inline `statusLegend` colors
- `agent-sidebar.tsx` — imports `STATUS_COLORS`, deletes local duplicate

### 2. Canvas Rendering Fixes

#### 2a. Offscreen Canvas DPR Scaling (P0)

**File**: `engine.ts` — `resize()` and constructor

- Scale `staticCanvas` and `bgCanvas` dimensions by `dpr`
- Apply `ctx.scale(dpr, dpr)` on `staticCtx` and `bgCtx` before drawing
- `draw()` uses `drawImage(bgCanvas, 0, 0, OFFICE_WIDTH, OFFICE_HEIGHT)` unchanged — logical size stays the same, physical resolution improves
- Invalidate caches (`staticReady = false`, `lastBgRenderTime = 0`) in `resize()`

#### 2b. GC Reduction — rgba String Pre-computation (P1)

**Files**: `sprites.ts`, `office.ts`, `engine.ts`

Three strategies applied contextually:

1. **Static strings**: Extract unchanging `"rgba(...)"` literals to module-level constants (e.g., `SHADOW_COLOR`, `DESK_BASE_COLOR`)
2. **Dynamic alpha via globalAlpha**: Replace `ctx.fillStyle = \`rgba(r, g, b, ${expr})\`` with `ctx.fillStyle = "#hex"; ctx.globalAlpha = expr;` wherever the only varying component is alpha
3. **Cached rgbaFromHex**: For `shadowColor` and other properties where `globalAlpha` does not apply, use the cached helper from `theme.ts`

#### 2c. Font Constants (P3)

**Files**: `office.ts`, `engine.ts`

Replace fixed-size inline font strings with `CANVAS_FONTS.label` / `CANVAS_FONTS.small`. Only covers the non-scale-dependent fonts; scale-dependent fonts in `sprites.ts` and `bubbles.ts` remain inline.

#### 2d. Shadow State Cleanup (P3)

**File**: `office.ts` — `drawZoneDetails()`

In the `bulletin` case (9-iteration loop) and `taskboard` case (card loop), wrap each shadow-using draw block with `ctx.save()`/`ctx.restore()` rather than manually resetting `shadowBlur = 0; shadowOffsetY = 0`. The wrapping is per shadow-block (not per loop iteration) to keep overhead minimal — e.g., one `save/restore` around the bulletin note drawing section (lines 197-208), and one around the taskboard card section (lines 255-262).

#### 2e. Status Glow for All Active Statuses (P3)

**File**: `sprites.ts` — `drawLobster()`

Replace the WORKING/POSTING if-else with a lookup on `STATUS_GLOW`:

```
const glow = STATUS_GLOW[status];
if (glow) {
  ctx.shadowColor = glow.color;
  ctx.shadowBlur = glow.blur * s;
  ctx.fillStyle = rgbaFromHex(glow.color, 0.15);
  ctx.fillRect(x - 8 * s, drawY - 8 * s, 16 * s, 24 * s);
  ctx.shadowBlur = 0;
}
```

The `blur` value in `STATUS_GLOW` controls per-status intensity (12 for WORKING, down to 6 for IDLE).

### 3. React Component Fixes

#### 3a. Agent Detail Card Theme Variables (P1)

**File**: `page.tsx:490-594`

Color mapping (verified against `globals.css` dark theme variables):

| Hardcoded | Replacement | Rationale |
|-----------|-------------|-----------|
| `bg-slate-900/80` | `bg-card/80` | `--card: rgba(14,19,51,0.6)` ≈ slate-900 |
| `border-slate-700/60` | `border-card-border/60` | existing pattern throughout codebase |
| `bg-slate-800/50` | `bg-card` | `--card` is `rgba(14,19,51,0.6)`, close to slate-800/50 |
| `text-slate-400` | `text-muted` | `--muted: #5e6690` maps to a similar medium gray |
| `text-slate-200` | `text-foreground/90` | `--foreground: #e4e8ff` at 90% ≈ slate-200 |
| `text-slate-500` | `text-muted/70` | lower contrast muted text |
| `border-slate-800` | `border-card-border` | standard border token |
| `from-slate-900/90` | `from-background/90` | `--background: #060918` ≈ slate-950 |
| `bg-slate-800` (avatar bg) | `bg-background-alt` | `--background-alt: #0c1029` — opaque, unlike `bg-card` which has built-in 0.6 alpha |
| `bg-slate-900/40` (close btn) | `bg-background/40` | background at low opacity |

Dynamic `statusColor` inline styles remain unchanged.

#### 3b. Detail Card / Status Legend Overlap (P1)

**File**: `page.tsx`

When `selectedAgentId` is truthy, hide the status legend. The detail card already shows the agent's status, so the legend is redundant when a card is open.

Implementation: wrap the status legend `<div>` in `{!selectedAgentId && (...)}`. The instant show/hide is acceptable for a floating overlay; no fade transition needed since the detail card's own `animate-in` provides visual continuity.

#### 3c. Backdrop-blur Mobile Degradation (P2)

**Files**: `page.tsx`, `agent-sidebar.tsx`, `activity-feed.tsx`

For all floating panels (zone legend, status legend, activity feed, sidebar toggle button):

```
backdrop-blur-xl  →  sm:backdrop-blur-xl
bg-background/60  →  bg-background/90 sm:bg-background/60
```

On small screens: no blur, higher opacity background for legibility.
On sm+: blur effect preserved as-is.

Detail card and sidebar (full panels): same pattern with `backdrop-blur-2xl → sm:backdrop-blur-2xl`.

#### 3d. Remove Canvas Transition (P2)

**File**: `page.tsx:437`

Delete `transition-opacity duration-500 ease-in-out` from the `<canvas>` element. This transition is never triggered and creates an unnecessary compositing layer.

#### 3e. Legend Opacity — Remove Flicker (P3)

**File**: `page.tsx:442, 460`

Both legends have `pointer-events-none` (to avoid blocking canvas clicks), which means `hover:opacity-100` would be a no-op. Instead, remove the opacity transition entirely — set both legends to a fixed `opacity-95`. The 5% dimming gives visual hierarchy without requiring interaction:

```
// before: opacity-90 group-hover:opacity-100
// after:  opacity-95
```

Also remove `transition-all duration-300` from these elements since there is no longer a state change to animate.

Note: the activity feed (`activity-feed.tsx`) has a similar `opacity-90 hover:opacity-100` pattern but is intentionally left unchanged — it is interactive (clickable agent names, expand button) and its hover behavior works correctly.

## Files Changed

| File | Changes |
|------|---------|
| `src/canvas/theme.ts` | **New** — shared STATUS_COLORS, STATUS_GLOW, CANVAS_FONTS, rgbaFromHex |
| `src/canvas/engine.ts` | DPR scaling for offscreen canvases; GC reduction |
| `src/canvas/office.ts` | Font constants; shadow state cleanup |
| `src/canvas/sprites.ts` | Status glow from lookup table; GC reduction |
| `src/canvas/bubbles.ts` | GC reduction (static rgba constants) |
| `src/app/office/page.tsx` | Import shared STATUS_COLORS; theme-aware detail card; hide legend on select; blur degradation; remove canvas transition; legend opacity fix |
| `src/app/office/agent-sidebar.tsx` | Import shared STATUS_COLORS; blur degradation |
| `src/app/office/activity-feed.tsx` | Blur degradation |

## Testing

- Existing tests in `office.test.ts`, `sprites.test.ts`, `bubbles.test.ts` must pass unchanged
- Manual verification: Retina display sharpness, mobile blur fallback, detail card theming
- Verify no visual regression at 0.5x and 3x zoom levels
