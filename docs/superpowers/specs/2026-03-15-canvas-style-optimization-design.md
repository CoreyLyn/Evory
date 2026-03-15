# Canvas Style Optimization Design

Date: 2026-03-15
Status: Draft
Scope: `src/canvas/`, `src/app/office/`

## Problem

The office Canvas UI has 11 style-related issues spanning rendering quality, performance, and maintainability:

- **P0**: Offscreen canvases lack DPR scaling (blurry on Retina); status colors defined in 3 separate files
- **P1**: Per-frame rgba template string allocation (GC pressure); agent detail card hardcodes slate colors; detail card overlaps status legend on medium screens
- **P2**: `imageSmoothingEnabled = false` causes jagged text; multiple stacked backdrop-blur elements hurt mobile performance; unused CSS transition on canvas element
- **P3**: Only WORKING/POSTING have status glow; manual shadow state resets in zone details; legend opacity flickers on group hover

## Approach

**Strategy A (chosen)**: Extract a shared theme module (`src/canvas/theme.ts`) as the single source of truth for colors and fonts, then fix canvas rendering and React component issues in separate passes.

Rejected alternative: in-place fixes without a shared module. Leaves color duplication partially unresolved.

## Design

### 1. Shared Theme Module — `src/canvas/theme.ts`

New file (~40 lines). Contains:

| Export | Type | Purpose |
|--------|------|---------|
| `STATUS_COLORS` | `Record<string, string>` | Hex colors for all 6 statuses |
| `STATUS_GLOW_COLORS` | `Record<string, string \| null>` | Glow color per status; `null` for OFFLINE |
| `CANVAS_FONTS` | `{ label, small, hud }` | Font strings used across canvas code |
| `rgbaFromHex(hex, alpha)` | `(string, number) => string` | Cached hex+alpha to rgba string conversion |

`rgbaFromHex` uses an internal `Map` cache (max 64 entries) to avoid per-frame string allocation.

**Consumers:**

- `sprites.ts` — imports `STATUS_COLORS`, `STATUS_GLOW_COLORS`
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

#### 2b. Text Anti-aliasing (P2)

**Files**: `engine.ts`, `sprites.ts`, `bubbles.ts`

Add a utility `withSmoothing(ctx, fn)` that temporarily sets `imageSmoothingEnabled = true`, calls `fn`, then restores `false`.

Apply at:
- `drawNameTag()` — agent name and points text
- `drawBubble()` — bubble label text
- `draw()` — HUD text (online count pill)
- `drawAnimatedOverlay()` — zone labels and entrance text

#### 2c. GC Reduction — rgba String Pre-computation (P1)

**Files**: `sprites.ts`, `office.ts`, `engine.ts`

Three strategies applied contextually:

1. **Static strings**: Extract unchanging `"rgba(...)"` literals to module-level constants (e.g., `SHADOW_COLOR`, `DESK_BASE_COLOR`)
2. **Dynamic alpha via globalAlpha**: Replace `ctx.fillStyle = \`rgba(r, g, b, ${expr})\`` with `ctx.fillStyle = "#hex"; ctx.globalAlpha = expr;` wherever the only varying component is alpha
3. **Cached rgbaFromHex**: For `shadowColor` and other properties where `globalAlpha` does not apply, use the cached helper from `theme.ts`

#### 2d. Font Constants (P3)

**Files**: `office.ts`, `engine.ts`, `sprites.ts`, `bubbles.ts`

Replace all inline font strings with `CANVAS_FONTS.label` / `CANVAS_FONTS.small` / `CANVAS_FONTS.hud`.

#### 2e. Shadow State Cleanup (P3)

**File**: `office.ts` — `drawZoneDetails()`

Replace manual `shadowBlur = 0; shadowOffsetY = 0` resets with local `ctx.save()`/`ctx.restore()` blocks wrapping shadow-using draw calls in `bulletin` and `taskboard` cases.

#### 2f. Status Glow for All Active Statuses (P3)

**File**: `sprites.ts` — `drawLobster()`

Replace the WORKING/POSTING if-else with a lookup on `STATUS_GLOW_COLORS`:

```
const glowColor = STATUS_GLOW_COLORS[status];
if (glowColor) {
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12 * s;
  ctx.fillStyle = rgbaFromHex(glowColor, 0.15);
  ctx.fillRect(...);
  ctx.shadowBlur = 0;
}
```

IDLE gets a lower shadowBlur (6 * s) for subtlety. OFFLINE gets `null` (no glow).

### 3. React Component Fixes

#### 3a. Agent Detail Card Theme Variables (P1)

**File**: `page.tsx:490-594`

Color mapping:

| Hardcoded | Replacement |
|-----------|-------------|
| `bg-slate-900/80` | `bg-card/80` |
| `border-slate-700/60` | `border-card-border/60` |
| `bg-slate-800/50` | `bg-foreground/5` |
| `text-slate-400` | `text-muted` |
| `text-slate-200` | `text-foreground/90` |
| `text-slate-500` | `text-muted/70` |
| `border-slate-800` | `border-card-border` |
| `from-slate-900/90` | `from-background/90` |
| `bg-slate-800` | `bg-card` |
| `bg-slate-900/40` | `bg-background/40` |

Dynamic `statusColor` inline styles remain unchanged.

#### 3b. Detail Card / Status Legend Overlap (P1)

**File**: `page.tsx`

When `selectedAgentId` is truthy, hide the status legend. The detail card already shows the agent's status, so the legend is redundant when a card is open.

Implementation: wrap the status legend `<div>` in `{!selectedAgentId && (...)}`.

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

#### 3e. Legend Opacity — Per-element Hover (P3)

**File**: `page.tsx:442, 460`

Change from `group-hover:opacity-100` (triggers on entire canvas container hover) to `hover:opacity-100` (triggers only when hovering the legend itself).

## Files Changed

| File | Changes |
|------|---------|
| `src/canvas/theme.ts` | **New** — shared constants and cached rgba helper |
| `src/canvas/engine.ts` | DPR scaling for offscreen canvases; text smoothing for HUD; remove canvas transition |
| `src/canvas/office.ts` | Font constants; shadow state cleanup; text smoothing for zone labels |
| `src/canvas/sprites.ts` | Status glow from lookup table; text smoothing for name tags; GC reduction |
| `src/canvas/bubbles.ts` | Font constants; text smoothing for bubble text |
| `src/app/office/page.tsx` | Import shared STATUS_COLORS; theme-aware detail card; hide legend on select; blur degradation; remove transition; legend hover fix |
| `src/app/office/agent-sidebar.tsx` | Import shared STATUS_COLORS; blur degradation |
| `src/app/office/activity-feed.tsx` | Blur degradation |

## Testing

- Existing tests in `office.test.ts`, `sprites.test.ts`, `bubbles.test.ts` must pass unchanged
- Manual verification: Retina display sharpness, mobile blur fallback, detail card theming
- Verify no visual regression at 0.5x and 3x zoom levels
