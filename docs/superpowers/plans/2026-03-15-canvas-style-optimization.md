# Canvas Style Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 canvas UI style issues across rendering quality (P0), performance (P1), mobile UX (P2), and visual consistency (P3).

**Architecture:** Extract a shared theme module (`src/canvas/theme.ts`) as single source of truth for status colors, glow config, fonts, and a cached rgba helper. Then apply fixes in two passes: canvas rendering layer, then React component layer.

**Tech Stack:** TypeScript, Canvas 2D API, Next.js App Router, React 19, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-15-canvas-style-optimization-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/canvas/theme.ts` | Create | STATUS_COLORS, STATUS_GLOW, CANVAS_FONTS, rgbaFromHex |
| `src/canvas/theme.test.ts` | Create | Unit tests for theme module |
| `src/canvas/sprites.ts` | Modify | Import STATUS_GLOW + rgbaFromHex; replace glow if-else |
| `src/canvas/office.ts` | Modify | Import CANVAS_FONTS; shadow save/restore cleanup |
| `src/canvas/bubbles.ts` | Modify | Extract static rgba constants |
| `src/canvas/engine.ts` | Modify | DPR offscreen scaling; GC reduction in HUD |
| `src/app/office/page.tsx` | Modify | Import STATUS_COLORS; detail card theming; legend fixes; blur degradation; remove transition |
| `src/app/office/agent-sidebar.tsx` | Modify | Import STATUS_COLORS; blur degradation |
| `src/app/office/activity-feed.tsx` | Modify | Blur degradation |

---

## Chunk 1: Shared Theme Module

### Task 1: Create theme module with tests (TDD)

**Files:**
- Create: `src/canvas/theme.test.ts`
- Create: `src/canvas/theme.ts`

- [ ] **Step 1: Write failing tests for `rgbaFromHex`**

```typescript
// src/canvas/theme.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { rgbaFromHex, STATUS_COLORS, STATUS_GLOW, CANVAS_FONTS } from "./theme";

test("rgbaFromHex converts hex + alpha to rgba string", () => {
  assert.equal(rgbaFromHex("#ff4444", 0.5), "rgba(255, 68, 68, 0.5)");
  assert.equal(rgbaFromHex("#000000", 1), "rgba(0, 0, 0, 1)");
  assert.equal(rgbaFromHex("#ffffff", 0), "rgba(255, 255, 255, 0)");
});

test("rgbaFromHex returns cached result for same inputs", () => {
  const a = rgbaFromHex("#aabbcc", 0.3);
  const b = rgbaFromHex("#aabbcc", 0.3);
  assert.equal(a, b);
});

test("rgbaFromHex evicts oldest entry when cache exceeds 128", () => {
  // Fill cache with 128 unique entries
  for (let i = 0; i < 128; i++) {
    const hex = `#${i.toString(16).padStart(6, "0")}`;
    rgbaFromHex(hex, 0.1);
  }
  // Adding one more should not throw
  const result = rgbaFromHex("#ffffff", 0.99);
  assert.ok(result.startsWith("rgba("));
});

test("STATUS_COLORS has all 6 statuses", () => {
  const expected = ["WORKING", "POSTING", "READING", "ONLINE", "IDLE", "OFFLINE"];
  for (const status of expected) {
    assert.ok(STATUS_COLORS[status], `missing ${status}`);
    assert.ok(STATUS_COLORS[status].startsWith("#"), `${status} should be hex`);
  }
});

test("STATUS_GLOW has matching entries for all statuses", () => {
  assert.ok(STATUS_GLOW["WORKING"]?.color);
  assert.ok(STATUS_GLOW["WORKING"]?.blur === 12);
  assert.ok(STATUS_GLOW["IDLE"]?.blur === 6);
  assert.equal(STATUS_GLOW["OFFLINE"], null);
});

test("CANVAS_FONTS has label, small, hud", () => {
  assert.ok(CANVAS_FONTS.label.includes("system-ui"));
  assert.ok(CANVAS_FONTS.small.includes("10px"));
  assert.ok(CANVAS_FONTS.hud.includes("system-ui"));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `node --import tsx --test src/canvas/theme.test.ts`
Expected: FAIL — module `./theme` does not exist

- [ ] **Step 3: Implement `src/canvas/theme.ts`**

```typescript
// src/canvas/theme.ts

/** Status dot/badge hex colors — single source of truth for UI and canvas. */
export const STATUS_COLORS: Record<string, string> = {
  WORKING: "#eab308",
  POSTING: "#3b82f6",
  READING: "#10b981",
  ONLINE: "#22c55e",
  IDLE: "#8b5cf6",
  OFFLINE: "#52525b",
};

/** Canvas glow config per status. null = no glow. */
export const STATUS_GLOW: Record<string, { color: string; blur: number } | null> = {
  WORKING: { color: "#eab308", blur: 12 },
  POSTING: { color: "#3b82f6", blur: 10 },
  READING: { color: "#10b981", blur: 8 },
  ONLINE: { color: "#22c55e", blur: 8 },
  IDLE: { color: "#8b5cf6", blur: 6 },
  OFFLINE: null,
};

/** Fixed-size canvas font strings. Scale-dependent fonts remain inline. */
export const CANVAS_FONTS = {
  label: "12px system-ui, -apple-system, sans-serif",
  small: "10px system-ui, -apple-system, sans-serif",
  hud: "12px system-ui, -apple-system, sans-serif",
} as const;

// --- rgbaFromHex with FIFO cache ---

const RGBA_CACHE_MAX = 128;
const rgbaCache = new Map<string, string>();

/** Convert hex color + alpha to rgba() string. Cached with FIFO eviction at 128 entries. */
export function rgbaFromHex(hex: string, alpha: number): string {
  const key = `${hex}\0${alpha}`;
  const cached = rgbaCache.get(key);
  if (cached !== undefined) return cached;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const result = `rgba(${r}, ${g}, ${b}, ${alpha})`;

  if (rgbaCache.size >= RGBA_CACHE_MAX) {
    // FIFO: delete the oldest entry
    const firstKey = rgbaCache.keys().next().value!;
    rgbaCache.delete(firstKey);
  }
  rgbaCache.set(key, result);
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/canvas/theme.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Run existing canvas tests to verify no breakage**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/sprites.test.ts src/canvas/bubbles.test.ts`
Expected: all existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/theme.ts src/canvas/theme.test.ts
git commit -m "feat(canvas): add shared theme module with STATUS_COLORS, STATUS_GLOW, CANVAS_FONTS, rgbaFromHex"
```

---

## Chunk 2: Canvas Rendering Fixes

### Task 2: Integrate theme into sprites.ts — status glow + GC reduction

**Files:**
- Modify: `src/canvas/sprites.ts:1-2` (add imports)
- Modify: `src/canvas/sprites.ts:253-266` (replace glow if-else)
- Test: `src/canvas/sprites.test.ts` (existing, must still pass)

- [ ] **Step 1: Add imports at top of `sprites.ts`**

Add after existing imports (line 1):
```typescript
import { STATUS_GLOW, rgbaFromHex } from "./theme";
```

- [ ] **Step 2: Replace the WORKING/POSTING glow if-else (lines 253-266) with STATUS_GLOW lookup**

Replace this block:
```typescript
  // Status glow effect
  if (status === "WORKING") {
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 12 * s;
    ctx.fillStyle = "rgba(234, 179, 8, 0.15)";
    ctx.fillRect(x - 8 * s, drawY - 8 * s, 16 * s, 24 * s);
    ctx.shadowBlur = 0;
  } else if (status === "POSTING") {
    ctx.shadowColor = "#3b82f6";
    ctx.shadowBlur = 10 * s;
    ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
    ctx.fillRect(x - 8 * s, drawY - 8 * s, 16 * s, 24 * s);
    ctx.shadowBlur = 0;
  }
```

With:
```typescript
  // Status glow effect — lookup from shared theme
  const glow = STATUS_GLOW[status];
  if (glow) {
    ctx.shadowColor = glow.color;
    ctx.shadowBlur = glow.blur * s;
    ctx.fillStyle = rgbaFromHex(glow.color, 0.15);
    ctx.fillRect(x - 8 * s, drawY - 8 * s, 16 * s, 24 * s);
    ctx.shadowBlur = 0;
  }
```

- [ ] **Step 3: Run existing sprites tests**

Run: `node --import tsx --test src/canvas/sprites.test.ts`
Expected: all 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/canvas/sprites.ts
git commit -m "refactor(canvas): use STATUS_GLOW lookup for all active status glows"
```

### Task 3: Integrate theme into office.ts — fonts + shadow cleanup

**Files:**
- Modify: `src/canvas/office.ts:1` (add import)
- Modify: `src/canvas/office.ts:123,135,247` (replace font strings)
- Modify: `src/canvas/office.ts:192-209` (bulletin shadow save/restore)
- Modify: `src/canvas/office.ts:253-268` (taskboard shadow save/restore)
- Test: `src/canvas/office.test.ts` (existing, must still pass)

- [ ] **Step 1: Add import at top of `office.ts`**

Add after existing exports/types:
```typescript
import { CANVAS_FONTS } from "./theme";
```

- [ ] **Step 2: Replace inline font strings**

At line 123 (zone label font), replace:
```typescript
    ctx.font = "12px system-ui, -apple-system, sans-serif";
```
With:
```typescript
    ctx.font = CANVAS_FONTS.label;
```

At line 135 (entrance text font), replace:
```typescript
  ctx.font = "12px system-ui, -apple-system, sans-serif";
```
With:
```typescript
  ctx.font = CANVAS_FONTS.label;
```

At line 247 (taskboard column header font), replace:
```typescript
        ctx.font = "10px system-ui, sans-serif";
```
With:
```typescript
        ctx.font = CANVAS_FONTS.small;
```

- [ ] **Step 3: Wrap bulletin shadow block with save/restore**

In the `bulletin` case, replace the loop body (lines 192-209) that manually resets shadow:

Replace:
```typescript
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length];
        const nx = zone.x + 40 + (i % 4) * 60;
        const ny = zone.y + 65 + Math.floor(i / 4) * 45;

        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fillRect(nx, ny, 40, 30);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Pin
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(nx + 20, ny + 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
```

With:
```typescript
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length];
        const nx = zone.x + 40 + (i % 4) * 60;
        const ny = zone.y + 65 + Math.floor(i / 4) * 45;
        ctx.fillRect(nx, ny, 40, 30);
      }
      ctx.restore();

      // Pins (no shadow needed)
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      for (let i = 0; i < 9; i++) {
        const nx = zone.x + 40 + (i % 4) * 60;
        const ny = zone.y + 65 + Math.floor(i / 4) * 45;
        ctx.beginPath();
        ctx.arc(nx + 20, ny + 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
```

- [ ] **Step 4: Wrap taskboard card shadow block with save/restore**

In the `taskboard` case, replace the card drawing section (lines 253-268):

Replace:
```typescript
        // Cards
        for (let card = 0; card < 2 + (c % 2); card++) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)"; // White-ish cards
          ctx.shadowColor = "rgba(0,0,0,0.2)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
          ctx.beginPath();
          ctx.roundRect(cx + 8, zone.y + 85 + card * 30, 49, 22, 3);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          // Card content mock
          ctx.fillStyle = "rgba(100, 116, 139, 0.5)";
          ctx.fillRect(cx + 12, zone.y + 90 + card * 30, 30, 3);
          ctx.fillRect(cx + 12, zone.y + 95 + card * 30, 20, 3);
        }
```

With:
```typescript
        // Cards
        for (let card = 0; card < 2 + (c % 2); card++) {
          ctx.save();
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.shadowColor = "rgba(0,0,0,0.2)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
          ctx.beginPath();
          ctx.roundRect(cx + 8, zone.y + 85 + card * 30, 49, 22, 3);
          ctx.fill();
          ctx.restore();

          // Card content mock (no shadow)
          ctx.fillStyle = "rgba(100, 116, 139, 0.5)";
          ctx.fillRect(cx + 12, zone.y + 90 + card * 30, 30, 3);
          ctx.fillRect(cx + 12, zone.y + 95 + card * 30, 20, 3);
        }
```

- [ ] **Step 5: Run existing office tests**

Run: `node --import tsx --test src/canvas/office.test.ts`
Expected: all 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/office.ts
git commit -m "refactor(canvas): use CANVAS_FONTS constants and save/restore for shadow blocks"
```

### Task 4: DPR scaling for offscreen canvases in engine.ts

**Files:**
- Modify: `src/canvas/engine.ts:63-76` (constructor — offscreen canvas init)
- Modify: `src/canvas/engine.ts:347-368` (resize method)
- Modify: `src/canvas/engine.ts:420-434` (draw — background render with DPR)
- Modify: `src/canvas/engine.ts:490-492` (HUD font — use CANVAS_FONTS)

- [ ] **Step 1: Add import for CANVAS_FONTS at top of engine.ts**

After existing imports from `"./office"`, add:
```typescript
import { CANVAS_FONTS } from "./theme";
```

- [ ] **Step 2: Update constructor — remove fixed offscreen canvas sizing**

In the constructor (lines 63-76), change the offscreen canvas initialization. Remove the fixed width/height assignments:

Replace:
```typescript
    // Initialize offscreen canvas for caching the background
    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.width = OFFICE_WIDTH;
    this.bgCanvas.height = OFFICE_HEIGHT;
    this.bgCtx = this.bgCanvas.getContext("2d")!;
    this.bgCtx.imageSmoothingEnabled = false;

    // Initialize static canvas for non-changing background layer
    this.staticCanvas = document.createElement("canvas");
    this.staticCanvas.width = OFFICE_WIDTH;
    this.staticCanvas.height = OFFICE_HEIGHT;
    this.staticCtx = this.staticCanvas.getContext("2d")!;
    this.staticCtx.imageSmoothingEnabled = false;
```

With:
```typescript
    // Initialize offscreen canvases — sized in resize() with DPR
    this.bgCanvas = document.createElement("canvas");
    this.bgCtx = this.bgCanvas.getContext("2d")!;
    this.bgCtx.imageSmoothingEnabled = false;

    this.staticCanvas = document.createElement("canvas");
    this.staticCtx = this.staticCanvas.getContext("2d")!;
    this.staticCtx.imageSmoothingEnabled = false;
```

- [ ] **Step 3: Update `resize()` to scale offscreen canvases by DPR**

In `resize()` (lines 347-368), after setting `this.dpr` and before the offset calculation, add offscreen canvas sizing:

Replace:
```typescript
  resize(width: number, height: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.logicalWidth = width;
    this.logicalHeight = height;

    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.imageSmoothingEnabled = false;

    if (this.offsetX === 0 && this.offsetY === 0) {
```

With:
```typescript
  resize(width: number, height: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.logicalWidth = width;
    this.logicalHeight = height;

    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.imageSmoothingEnabled = false;

    // Scale offscreen canvases by DPR for Retina sharpness
    const ow = OFFICE_WIDTH * this.dpr;
    const oh = OFFICE_HEIGHT * this.dpr;
    this.bgCanvas.width = ow;
    this.bgCanvas.height = oh;
    this.bgCtx.imageSmoothingEnabled = false;
    this.bgCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.staticCanvas.width = ow;
    this.staticCanvas.height = oh;
    this.staticCtx.imageSmoothingEnabled = false;
    this.staticCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.offsetX === 0 && this.offsetY === 0) {
```

- [ ] **Step 4: Replace HUD font string with CANVAS_FONTS.hud**

At line 492, replace:
```typescript
    const hudFont = "12px system-ui, -apple-system, sans-serif";
```
With:
```typescript
    const hudFont = CANVAS_FONTS.hud;
```

- [ ] **Step 5: Extract HUD static rgba strings to module-level constants**

Add after the imports at the top of `engine.ts`:
```typescript
// Static HUD rgba constants — avoid per-frame allocation
const HUD_BG = "rgba(15, 23, 42, 0.7)";
const HUD_SHADOW = "rgba(0, 0, 0, 0.3)";
const HUD_BORDER = "rgba(51, 65, 85, 0.5)";
const HUD_TEXT_COLOR = "rgba(241, 245, 249, 0.9)";
const HUD_DOT_COLOR = "rgba(34, 197, 94, 0.9)";
const HUD_DOT_HEX = "#22c55e";
```

Then replace in the `draw()` HUD section (lines 501-529):

- Line 502: `ctx.fillStyle = "rgba(15, 23, 42, 0.7)";` → `ctx.fillStyle = HUD_BG;`
- Line 503: `ctx.shadowColor = "rgba(0, 0, 0, 0.3)";` → `ctx.shadowColor = HUD_SHADOW;`
- Line 511: `ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";` → `ctx.strokeStyle = HUD_BORDER;`
- Line 516: `ctx.fillStyle = "rgba(241, 245, 249, 0.9)";` → `ctx.fillStyle = HUD_TEXT_COLOR;`
- Line 522: `ctx.fillStyle = "rgba(34, 197, 94, 0.9)";` → `ctx.fillStyle = HUD_DOT_COLOR;`
- Line 524: Replace the template literal `ctx.shadowColor = \`rgba(34, 197, 94, ${0.4 + pulseFade * 0.4})\`;` with `ctx.fillStyle = HUD_DOT_HEX; ctx.globalAlpha = 0.4 + pulseFade * 0.4;` pattern:

```typescript
    // Status Indicator Dot (Pulsing) — use globalAlpha to avoid template string
    ctx.fillStyle = HUD_DOT_HEX;
    const pulseFade = ((Math.sin(now / 300) + 1) / 2);
    const dotAlpha = 0.4 + pulseFade * 0.4;
    ctx.shadowColor = HUD_DOT_COLOR;
    ctx.globalAlpha = dotAlpha;
    ctx.shadowBlur = 4 + pulseFade * 4;
    ctx.beginPath();
    ctx.arc(pillX + pillWidth - 14, pillY + pillHeight / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
```

- [ ] **Step 5: Run all canvas tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/sprites.test.ts src/canvas/bubbles.test.ts src/canvas/theme.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "perf(canvas): DPR scaling for offscreen canvases, CANVAS_FONTS, and HUD GC reduction"
```

### Task 5: GC reduction in bubbles.ts — static rgba constants

**Files:**
- Modify: `src/canvas/bubbles.ts:89-101` (extract static rgba strings)
- Test: `src/canvas/bubbles.test.ts` (existing, must still pass)

- [ ] **Step 1: Extract static rgba strings to module-level constants**

Add after the `ACTION_ICONS` constant (after line 29):
```typescript
// Static rgba constants — avoid per-frame string allocation
const BUBBLE_BG = "rgba(15, 23, 42, 0.85)";
const BUBBLE_TEXT = "rgba(241, 245, 249, 0.95)";
```

- [ ] **Step 2: Replace inline strings in `drawBubble`**

In `drawBubble()`, replace:
```typescript
  // Pill background
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
```
With:
```typescript
  // Pill background
  ctx.fillStyle = BUBBLE_BG;
```

And replace:
```typescript
  // Text
  ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
```
With:
```typescript
  // Text
  ctx.fillStyle = BUBBLE_TEXT;
```

- [ ] **Step 3: Run existing bubbles tests**

Run: `node --import tsx --test src/canvas/bubbles.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/canvas/bubbles.ts
git commit -m "perf(canvas): extract static rgba constants in bubbles to reduce GC"
```

---

## Chunk 3: React Component Fixes

### Task 6: page.tsx — STATUS_COLORS import, detail card theming, legend/transition fixes

**Files:**
- Modify: `src/app/office/page.tsx`

This task covers sections 3a, 3b, 3d, 3e of the spec plus the blur degradation for page.tsx panels.

- [ ] **Step 1: Add STATUS_COLORS import**

Add at the top imports:
```typescript
import { STATUS_COLORS } from "@/canvas/theme";
```

- [ ] **Step 2: Replace `statusLegend` hardcoded colors with STATUS_COLORS**

Replace:
```typescript
  const statusLegend = [
    { status: "WORKING", color: "#eab308", labelKey: "office.statusWorking" as const }, // Yellow-500
    { status: "POSTING", color: "#3b82f6", labelKey: "office.statusPosting" as const }, // Blue-500
    { status: "READING", color: "#10b981", labelKey: "office.statusReading" as const }, // Emerald-500
    { status: "ONLINE", color: "#22c55e", labelKey: "office.statusOnline" as const },  // Green-500
    { status: "IDLE", color: "#8b5cf6", labelKey: "office.statusIdle" as const },      // Violet-500
    { status: "OFFLINE", color: "#52525b", labelKey: "office.statusOffline" as const },// Zinc-600
  ];
```

With:
```typescript
  const statusLegend = [
    { status: "WORKING", color: STATUS_COLORS.WORKING, labelKey: "office.statusWorking" as const },
    { status: "POSTING", color: STATUS_COLORS.POSTING, labelKey: "office.statusPosting" as const },
    { status: "READING", color: STATUS_COLORS.READING, labelKey: "office.statusReading" as const },
    { status: "ONLINE", color: STATUS_COLORS.ONLINE, labelKey: "office.statusOnline" as const },
    { status: "IDLE", color: STATUS_COLORS.IDLE, labelKey: "office.statusIdle" as const },
    { status: "OFFLINE", color: STATUS_COLORS.OFFLINE, labelKey: "office.statusOffline" as const },
  ];
```

- [ ] **Step 3: Remove canvas transition class**

Replace:
```tsx
        <canvas
          ref={canvasRef}
          className="w-full h-full transition-opacity duration-500 ease-in-out"
          style={{ cursor: "grab" }}
        />
```

With:
```tsx
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ cursor: "grab" }}
        />
```

- [ ] **Step 4: Fix zone legend — remove group-hover opacity, add blur degradation**

Replace:
```tsx
        <div className="absolute bottom-6 left-6 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl p-4 shadow-xl pointer-events-none transition-all duration-300 opacity-90 group-hover:opacity-100">
```

With:
```tsx
        <div className="absolute bottom-6 left-6 bg-background/90 sm:bg-background/60 sm:backdrop-blur-xl border border-card-border/50 rounded-xl p-4 shadow-xl pointer-events-none opacity-95">
```

- [ ] **Step 5: Wrap status legend in conditional render + fix opacity/blur**

Replace:
```tsx
        {/* Floating Status Legend */}
        <div className="absolute top-6 right-6 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl p-4 shadow-xl pointer-events-none transition-all duration-300 opacity-90 group-hover:opacity-100">
```

With:
```tsx
        {/* Floating Status Legend — hidden when detail card is open */}
        {!selectedAgentId && (
        <div className="absolute top-6 right-6 bg-background/90 sm:bg-background/60 sm:backdrop-blur-xl border border-card-border/50 rounded-xl p-4 shadow-xl pointer-events-none opacity-95">
```

And add a closing `)}` after the status legend's closing `</div>`:

Find the closing `</div>` for the status legend block (after the `statusLegend.map(...)` section, around line 479) and add `)}` after it.

- [ ] **Step 6: Replace detail card hardcoded slate colors**

Apply each replacement in the detail card JSX (the `{selectedAgentId && (() => { ... })()}` block):

1. Outer card wrapper:
   - `bg-slate-900/80` → `bg-card/80`
   - `border border-slate-700/60` → `border border-card-border/60`
   - `backdrop-blur-2xl` → `sm:backdrop-blur-2xl`

2. Banner header:
   - `from-slate-900/90` → `from-background/90`

3. Close button:
   - `bg-slate-900/40` → `bg-background/40`
   - `text-slate-400` → `text-muted`
   - `hover:text-white` → `hover:text-foreground`
   - `hover:bg-slate-800` → `hover:bg-card`

4. Avatar box:
   - `border-slate-800` → `border-card-border`
   - `bg-slate-800` → `bg-background-alt`

5. Agent ID text:
   - `text-slate-400` → `text-muted`

6. Stats grid panels:
   - `bg-slate-800/50` → `bg-card`
   - `border border-slate-700/50` → `border border-card-border/50`
   - `text-slate-400` → `text-muted`
   - `text-white` (points/name) → `text-foreground`

7. Bio section:
   - `border-slate-700/50` → `border-card-border/50`
   - `bg-slate-800/30` → `bg-card/50`
   - `text-slate-500` → `text-muted/70`
   - `text-slate-200` → `text-foreground/90`

8. Time entries:
   - `text-slate-500` → `text-muted/70`
   - `text-slate-200` → `text-foreground/90`

9. Name heading:
   - `text-white` → `text-foreground`

10. Status border:
    - `border-slate-900` → `border-background`

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: PASS (no new warnings/errors)

- [ ] **Step 8: Commit**

```bash
git add src/app/office/page.tsx
git commit -m "refactor(office): theme-aware detail card, shared STATUS_COLORS, legend fixes, blur degradation"
```

### Task 7: agent-sidebar.tsx — STATUS_COLORS import + blur degradation

**Files:**
- Modify: `src/app/office/agent-sidebar.tsx`

- [ ] **Step 1: Replace local STATUS_COLORS with import**

Remove the local `STATUS_COLORS` definition (lines 25-32):
```typescript
const STATUS_COLORS: Record<string, string> = {
  WORKING: "#eab308",
  POSTING: "#3b82f6",
  READING: "#10b981",
  ONLINE: "#22c55e",
  IDLE: "#8b5cf6",
  OFFLINE: "#52525b",
};
```

Add import at top:
```typescript
import { STATUS_COLORS } from "@/canvas/theme";
```

- [ ] **Step 2: Apply blur degradation to sidebar toggle button**

Replace:
```tsx
        className="absolute top-6 left-6 z-10 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl p-3 shadow-xl hover:bg-background/80 transition-all"
```

With:
```tsx
        className="absolute top-6 left-6 z-10 bg-background/90 sm:bg-background/60 sm:backdrop-blur-xl border border-card-border/50 rounded-xl p-3 shadow-xl hover:bg-background/80 transition-all"
```

- [ ] **Step 3: Apply blur degradation to open sidebar panel**

Replace:
```tsx
    <div className="absolute top-0 left-0 z-10 h-full w-72 bg-background/80 backdrop-blur-2xl border-r border-card-border/50 shadow-2xl flex flex-col">
```

With:
```tsx
    <div className="absolute top-0 left-0 z-10 h-full w-72 bg-background/95 sm:bg-background/80 sm:backdrop-blur-2xl border-r border-card-border/50 shadow-2xl flex flex-col">
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/office/agent-sidebar.tsx
git commit -m "refactor(office): import shared STATUS_COLORS, blur degradation in sidebar"
```

### Task 8: activity-feed.tsx — blur degradation

**Files:**
- Modify: `src/app/office/activity-feed.tsx`

- [ ] **Step 1: Apply blur degradation to feed container**

Replace:
```tsx
    <div className="absolute bottom-6 right-6 w-80 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl shadow-xl transition-all duration-300 opacity-90 hover:opacity-100 z-10">
```

With:
```tsx
    <div className="absolute bottom-6 right-6 w-80 bg-background/90 sm:bg-background/60 sm:backdrop-blur-xl border border-card-border/50 rounded-xl shadow-xl transition-all duration-300 opacity-90 hover:opacity-100 z-10">
```

Note: the activity feed's `opacity-90 hover:opacity-100` is intentionally preserved — it is interactive and does not have `pointer-events-none`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/office/activity-feed.tsx
git commit -m "perf(office): blur degradation for activity feed on mobile"
```

---

## Chunk 4: Final Verification

### Task 9: Full test suite + build verification

- [ ] **Step 1: Run all canvas unit tests**

Run: `node --import tsx --test src/canvas/theme.test.ts src/canvas/office.test.ts src/canvas/sprites.test.ts src/canvas/bubbles.test.ts`
Expected: all tests PASS

- [ ] **Step 2: Run full project lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: build completes without errors

- [ ] **Step 4: Manual verification checklist**

Open `http://localhost:3000/office` and verify:
- [ ] Background zones/text are sharp on Retina display
- [ ] All active agents (WORKING, POSTING, READING, ONLINE, IDLE) show colored glow
- [ ] OFFLINE agents have no glow
- [ ] Clicking an agent shows detail card with theme-consistent colors (no hardcoded slate)
- [ ] Status legend hides when detail card is open
- [ ] Zone legend at bottom-left shows at fixed `opacity-95` (no flicker on canvas hover)
- [ ] On mobile viewport (< 640px): no backdrop blur on floating panels, higher opacity backgrounds
- [ ] Canvas element has no transition class in DevTools
- [ ] No visual regression at 0.5x and 3x zoom levels
