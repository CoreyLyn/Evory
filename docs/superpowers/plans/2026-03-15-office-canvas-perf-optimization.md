# Office Canvas Performance Optimization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate per-frame GC pressure, optimize rendering hot paths, add delta-time animations, HiDPI support, and idle power saving to the office canvas.

**Architecture:** The office canvas (`src/canvas/`) runs a 60fps `requestAnimationFrame` loop rendering agent sprites, activity bubbles, and a decorated background. Current implementation creates many temporary objects per frame (spread operators, Array.from, filter chains) and repeats expensive operations (color parsing, text measurement, gradient creation) that can be cached. We will optimize in three phases: GC elimination, rendering pipeline improvements, and display quality enhancements.

**Tech Stack:** Canvas 2D API, TypeScript, Node.js native test runner

---

## Chunk 1: GC Pressure & Hot Path Elimination (P0)

### Task 1: In-place agent position updates

Current `updateAgentPosition` returns a new object via `{...agent}` every frame for every agent. Switch to in-place mutation.

**Files:**
- Modify: `src/canvas/office.ts:361-408` (replace `updateAgentPosition`)
- Modify: `src/canvas/engine.ts:307-320` (update call site in `update()`)
- Create: `src/canvas/office.test.ts`

- [ ] **Step 1: Write failing test for in-place position update**

Create `src/canvas/office.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { updateAgentPosition, AgentPosition } from "./office";

function makeAgent(overrides: Partial<AgentPosition> = {}): AgentPosition {
  return {
    id: "test-1",
    name: "Test",
    status: "WORKING",
    points: 0,
    appearance: { color: "red", hat: null, accessory: null },
    x: 100, y: 100,
    targetX: 200, targetY: 200,
    frame: 0,
    ...overrides,
  };
}

test("updateAgentPosition mutates agent in-place and returns void", () => {
  const agent = makeAgent();
  const result = updateAgentPosition(agent);
  assert.equal(result, undefined);
  assert.ok(agent.x > 100, "x should have moved toward target");
  assert.ok(agent.y > 100, "y should have moved toward target");
  assert.equal(agent.frame, 1);
});

test("updateAgentPosition snaps to target when within threshold", () => {
  const agent = makeAgent({ x: 199.5, y: 199.5 });
  updateAgentPosition(agent);
  assert.equal(agent.x, 200);
  assert.equal(agent.y, 200);
});

test("updateAgentPosition respects max speed", () => {
  const agent = makeAgent({ x: 0, y: 0, targetX: 1000, targetY: 1000 });
  updateAgentPosition(agent);
  const moved = Math.sqrt(agent.x ** 2 + agent.y ** 2);
  assert.ok(moved <= 4.1, `moved ${moved}, expected <= max speed 4.0`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/canvas/office.test.ts`
Expected: FAIL — current `updateAgentPosition` returns `AgentPosition`, not `void`

- [ ] **Step 3: Rewrite `updateAgentPosition` to mutate in-place**

Replace the function in `src/canvas/office.ts:361-408`:

```typescript
export function updateAgentPosition(agent: AgentPosition, easeFactor: number = 0.04): void {
  const dx = agent.targetX - agent.x;
  const dy = agent.targetY - agent.y;
  const distSq = dx * dx + dy * dy;

  agent.frame++;

  // Snap to target when close enough
  if (distSq < 1.0) {
    agent.x = agent.targetX;
    agent.y = agent.targetY;
    // Small chance to roam within zone
    if (Math.random() < 0.02) {
      const zone = getZoneForStatus(agent.status);
      const newPos = getRandomPositionInZone(zone);
      agent.targetX = newPos.x;
      agent.targetY = newPos.y;
    }
    return;
  }

  let vx = dx * easeFactor;
  let vy = dy * easeFactor;
  const speed = Math.sqrt(vx * vx + vy * vy);

  // Enforce minimum speed to avoid Zeno's paradox
  if (speed < 0.3) {
    const scale = 0.3 / speed;
    vx *= scale;
    vy *= scale;
  } else if (speed > 4.0) {
    const scale = 4.0 / speed;
    vx *= scale;
    vy *= scale;
  }

  agent.x += vx;
  agent.y += vy;
}
```

- [ ] **Step 4: Update `engine.ts` call site**

In `src/canvas/engine.ts:307-320`, change the `update()` method:

```typescript
private update() {
  let anyMoving = false;
  for (const agent of this.agents.values()) {
    updateAgentPosition(agent);
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    if (dx * dx + dy * dy > 4) anyMoving = true;
  }
  updateBubbles(this.bubbles);
  this.bgThrottleMs = (anyMoving || this.bubbles.length > 0) ? 50 : 200;
}
```

Note: removed `const updated =` and `this.agents.set(id, updated)` — no longer needed since we mutate in-place. Also use `dx*dx + dy*dy > 4` instead of `Math.sqrt(...) > 2`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/canvas/office.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/office.ts src/canvas/office.test.ts src/canvas/engine.ts
git commit -m "perf(canvas): in-place agent position mutation, eliminate per-frame object allocation"
```

---

### Task 2: In-place bubble updates

Current `updateBubbles` creates a new array and new objects every frame. Switch to in-place mutation with array compaction.

**Files:**
- Modify: `src/canvas/bubbles.ts:49-62`
- Modify: `src/canvas/bubbles.test.ts`
- Modify: `src/canvas/engine.ts` (update call site — already partially done in Task 1)

- [ ] **Step 1: Update tests for in-place mutation**

Replace `src/canvas/bubbles.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { createBubble, updateBubbles } from "./bubbles";

test("createBubble returns a bubble with correct defaults", () => {
  const bubble = createBubble("agent-1", "posted", "New post title");
  assert.equal(bubble.agentId, "agent-1");
  assert.equal(bubble.action, "posted");
  assert.equal(bubble.text, "New post title");
  assert.ok(bubble.ttl > 0);
  assert.ok(bubble.opacity > 0);
});

test("updateBubbles mutates in-place, removes expired", () => {
  const bubbles = [
    createBubble("a1", "posted", "Hi"),
    { ...createBubble("a2", "claimed", "Task"), ttl: 1 },
  ];
  const origTtl = bubbles[0].ttl;
  updateBubbles(bubbles);
  assert.equal(bubbles.length, 1, "expired bubble should be removed");
  assert.equal(bubbles[0].agentId, "a1");
  assert.equal(bubbles[0].ttl, origTtl - 1);
});

test("updateBubbles empties array when all expired", () => {
  const bubbles = [
    { ...createBubble("a1", "posted", "Hi"), ttl: 1 },
  ];
  updateBubbles(bubbles);
  assert.equal(bubbles.length, 0);
});

test("updateBubbles updates offsetY for floating effect", () => {
  const bubbles = [createBubble("a1", "posted", "Hi")];
  const origY = bubbles[0].offsetY;
  updateBubbles(bubbles);
  assert.ok(bubbles[0].offsetY > origY);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/canvas/bubbles.test.ts`
Expected: FAIL — current `updateBubbles` returns new array, doesn't mutate

- [ ] **Step 3: Rewrite `updateBubbles` to mutate in-place**

Replace in `src/canvas/bubbles.ts:49-62`:

```typescript
/** Mutate bubbles array in-place: decrement TTL, remove expired, update animation. */
export function updateBubbles(bubbles: ActivityBubble[]): void {
  let write = 0;
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    b.ttl--;
    if (b.ttl <= 0) continue;
    b.opacity = Math.min(1, b.ttl / 60);
    b.offsetY += 0.3;
    bubbles[write++] = b;
  }
  bubbles.length = write;
}
```

- [ ] **Step 4: Update engine.ts call site**

In `src/canvas/engine.ts` `update()` method, change:

```typescript
// Before: this.bubbles = updateBubbles(this.bubbles);
// After:
updateBubbles(this.bubbles);
```

- [ ] **Step 5: Run tests**

Run: `node --import tsx --test src/canvas/bubbles.test.ts && node --import tsx --test src/canvas/office.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/bubbles.ts src/canvas/bubbles.test.ts src/canvas/engine.ts
git commit -m "perf(canvas): in-place bubble mutation, eliminate per-frame array allocation"
```

---

### Task 3: Color conversion cache

`darkenColor()` / `lightenColor()` in `sprites.ts` parse hex strings with `parseInt` every frame for every agent. There are only 9 predefined colors — precompute all variants.

**Files:**
- Modify: `src/canvas/sprites.ts:287-299` (move to module-level cache)
- Modify: `src/canvas/sprites.ts:111-113` (use cache in `drawLobster`)
- Create: `src/canvas/sprites.test.ts`

- [ ] **Step 1: Write test for color cache**

Create `src/canvas/sprites.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { getColorVariants } from "./sprites";

test("getColorVariants returns dark and light for known color", () => {
  const v = getColorVariants("#ff4444");
  assert.ok(v.dark.startsWith("rgb("));
  assert.ok(v.light.startsWith("rgb("));
  assert.notEqual(v.dark, v.light);
});

test("getColorVariants returns same reference for same input", () => {
  const a = getColorVariants("#ff4444");
  const b = getColorVariants("#ff4444");
  assert.equal(a, b, "should return cached reference");
});

test("getColorVariants dark is darker than original", () => {
  const v = getColorVariants("#ff4444");
  // dark should have lower RGB values
  const match = v.dark.match(/rgb\((\d+), (\d+), (\d+)\)/);
  assert.ok(match);
  assert.ok(Number(match[1]) < 255);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/canvas/sprites.test.ts`
Expected: FAIL — `getColorVariants` not exported

- [ ] **Step 3: Add cached color lookup and precompute variants**

In `src/canvas/sprites.ts`, add after the `LOBSTER_COLORS` definition (~line 24):

```typescript
interface ColorVariants { body: string; dark: string; light: string }

const colorVariantsCache = new Map<string, ColorVariants>();

export function getColorVariants(hex: string): ColorVariants {
  let v = colorVariantsCache.get(hex);
  if (!v) {
    v = { body: hex, dark: darkenColor(hex, 0.3), light: lightenColor(hex, 0.3) };
    colorVariantsCache.set(hex, v);
  }
  return v;
}

// Precompute all known colors at module load
for (const hex of Object.values(LOBSTER_COLORS)) {
  getColorVariants(hex);
}
```

Then in `drawLobster` (~line 111-113), replace:

```typescript
// Before:
const bodyColor = color;
const darkColor = darkenColor(color, 0.3);
const lightColor = lightenColor(color, 0.3);

// After:
const cv = getColorVariants(color);
const bodyColor = cv.body;
const darkColor = cv.dark;
const lightColor = cv.light;
```

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test src/canvas/sprites.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/sprites.ts src/canvas/sprites.test.ts
git commit -m "perf(canvas): precompute color variants, eliminate per-frame hex parsing"
```

---

### Task 4: Draw loop allocations — bubble Map, sorted array, HUD count

Three remaining per-frame allocations in `engine.ts draw()`:
1. `this.bubbles.filter(b => b.agentId === agent.id)` for each agent — O(agents x bubbles)
2. `Array.from(this.agents.values()).sort(...)` — new array every frame
3. `Array.from(this.agents.values()).filter(...)` for HUD — new array every frame

**Files:**
- Modify: `src/canvas/engine.ts` (add class fields, refactor `draw()`)

- [ ] **Step 1: Add reusable fields to OfficeEngine**

Add to class fields (after line 38):

```typescript
private sortedAgents: AgentPosition[] = [];
private bubbleMap: Map<string, ActivityBubble> = new Map();
private onlineCount: number = 0;
```

- [ ] **Step 2: Refactor `updateAgents()` to track online count**

At the end of `updateAgents()` (after line 267), add:

```typescript
this.onlineCount = 0;
for (const agent of this.agents.values()) {
  if (agent.status !== "OFFLINE") this.onlineCount++;
}
```

- [ ] **Step 3: Refactor `draw()` to reuse sorted array and pre-index bubbles**

Replace the agent rendering section in `draw()` (lines 346-380):

```typescript
// Pre-index bubbles by agentId (max 1 per agent), reuse Map
this.bubbleMap.clear();
for (const b of this.bubbles) {
  this.bubbleMap.set(b.agentId, b);
}

// Reuse sorted array — populate then sort
this.sortedAgents.length = 0;
for (const agent of this.agents.values()) {
  this.sortedAgents.push(agent);
}
this.sortedAgents.sort((a, b) => a.y - b.y);

for (const agent of this.sortedAgents) {
  // Frustum Culling: Skip if completely off-screen
  if (
    agent.x + renderPadding < viewWorldMinX ||
    agent.x - renderPadding > viewWorldMaxX ||
    agent.y + renderPadding < viewWorldMinY ||
    agent.y - renderPadding > viewWorldMaxY
  ) {
    continue;
  }

  const isHovered = this.hoveredAgent === agent.id;
  const spriteScale = isHovered ? 2.3 : 2;
  drawLobster(ctx, agent.x, agent.y, agent.appearance, agent.status, agent.frame, spriteScale, isHovered);
  drawNameTag(ctx, agent.x, agent.y, agent.name, agent.points, spriteScale, this.scale, isHovered);

  const bubble = this.bubbleMap.get(agent.id);
  if (bubble) {
    drawBubble(ctx, agent.x, agent.y, bubble, spriteScale);
  }
}
```

- [ ] **Step 4: Replace HUD count allocation**

Replace lines 385-387:

```typescript
// Before:
const onlineCount = Array.from(this.agents.values()).filter(a => a.status !== "OFFLINE").length;
const totalCount = this.agents.size;

// After:
const onlineCount = this.onlineCount;
const totalCount = this.agents.size;
```

Also update `getOnlineCount()` at the bottom:

```typescript
getOnlineCount() {
  return this.onlineCount;
}
```

- [ ] **Step 5: Run all canvas tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "perf(canvas): reuse sorted array, pre-index bubbles, cache online count"
```

---

### Task 5: measureText caching

`ctx.measureText()` is called every frame per visible agent (name tag) and per bubble. Text rarely changes — cache by font+text key.

**Files:**
- Modify: `src/canvas/sprites.ts:241-285` (name tag)
- Modify: `src/canvas/bubbles.ts:64-105` (bubble drawing)
- Modify: `src/canvas/engine.ts:389-394` (HUD text)

- [ ] **Step 1: Add module-level text width cache in `sprites.ts`**

Add near top of `src/canvas/sprites.ts`:

```typescript
/** Cache for text width measurements. Bounded by working set (agent names + bubble texts). */
const textWidthCache = new Map<string, number>();

export function cachedMeasureText(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  const key = `${font}\0${text}`;
  let w = textWidthCache.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    textWidthCache.set(key, w);
  }
  return w;
}
```

- [ ] **Step 2: Use cache in `drawNameTag`**

In `drawNameTag` (~line 259-266), replace:

```typescript
// Before:
ctx.font = `${8 * s}px monospace`;
ctx.textAlign = "center";
// ...
const textWidth = ctx.measureText(name).width;

// After:
const font = `${8 * s}px monospace`;
ctx.font = font;
ctx.textAlign = "center";
const textWidth = cachedMeasureText(ctx, name, font);
```

- [ ] **Step 3: Use cache in `bubbles.ts`**

In `bubbles.ts`, import and use in `drawBubble` (~line 80-81):

```typescript
import { cachedMeasureText } from "./sprites";

// In drawBubble:
// Before:
ctx.font = `${7 * s}px system-ui, -apple-system, sans-serif`;
const textWidth = ctx.measureText(label).width;

// After:
const font = `${7 * s}px system-ui, -apple-system, sans-serif`;
ctx.font = font;
const textWidth = cachedMeasureText(ctx, label, font);
```

- [ ] **Step 4: Use cache in engine.ts HUD**

In `engine.ts draw()` HUD section (~line 390-394):

```typescript
import { cachedMeasureText } from "./sprites";

// Before:
ctx.font = "12px system-ui, -apple-system, sans-serif";
const textMetrics = ctx.measureText(hudText);
const pillWidth = textMetrics.width + 24;

// After:
const hudFont = "12px system-ui, -apple-system, sans-serif";
ctx.font = hudFont;
const pillWidth = cachedMeasureText(ctx, hudText, hudFont) + 24;
```

- [ ] **Step 5: Run all tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/sprites.ts src/canvas/bubbles.ts src/canvas/engine.ts
git commit -m "perf(canvas): cache measureText results, eliminate per-frame text measurement"
```

---

## Chunk 2: Rendering Pipeline & UX (P1)

### Task 6: Static background layer split

The background gradient, grid, and walls never change. Currently they're re-rendered every 50-200ms via `drawOffice`. Split into a static layer drawn once and an animated layer drawn throttled.

**Files:**
- Modify: `src/canvas/office.ts:57-145` (split `drawOffice` into two functions)
- Modify: `src/canvas/engine.ts:45-58, 335-344` (add static canvas, update draw logic)

- [ ] **Step 1: Split `drawOffice` into `drawStaticBackground` and `drawAnimatedOverlay`**

In `src/canvas/office.ts`, replace `drawOffice` with two functions:

```typescript
/** Draw once: gradient, grid, walls, entrance bar. Never changes. */
export function drawStaticBackground(ctx: CanvasRenderingContext2D, labels: CanvasLabels = DEFAULT_LABELS) {
  // Background gradient
  const bgGradient = ctx.createRadialGradient(
    OFFICE_WIDTH / 2, OFFICE_HEIGHT / 2, 100,
    OFFICE_WIDTH / 2, OFFICE_HEIGHT / 2, OFFICE_WIDTH
  );
  bgGradient.addColorStop(0, "#0f172a");
  bgGradient.addColorStop(1, "#020617");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);

  // Grid
  ctx.strokeStyle = "rgba(148, 163, 184, 0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < OFFICE_WIDTH; x += TILE_SIZE) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, OFFICE_HEIGHT);
  }
  for (let y = 0; y < OFFICE_HEIGHT; y += TILE_SIZE) {
    ctx.moveTo(0, y);
    ctx.lineTo(OFFICE_WIDTH, y);
  }
  ctx.stroke();

  // Outer Walls
  ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, OFFICE_WIDTH - 4, OFFICE_HEIGHT - 4);

  // Door bar
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.fillRect(OFFICE_WIDTH / 2 - 40, OFFICE_HEIGHT - 8, 80, 8);
}

/** Draw throttled: zone glows, decorations, animated elements. */
export function drawAnimatedOverlay(ctx: CanvasRenderingContext2D, labels: CanvasLabels = DEFAULT_LABELS, time: number = 0) {
  const breathe = (Math.sin(time / 1000) + 1) / 2;

  for (const zone of ZONES) {
    ctx.save();
    ctx.fillStyle = zone.color;
    ctx.shadowColor = zone.borderColor;
    ctx.shadowBlur = 10 + breathe * 10;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    drawZoneDetails(ctx, zone, labels, time);

    const zoneLabel = labels.zones[zone.name] ?? zone.label;
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.beginPath();
    ctx.roundRect(zone.x + 12, zone.y + 12, 100, 24, 6);
    ctx.fill();
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${zone.icon} ${zoneLabel}`, zone.x + 20, zone.y + 24);
    ctx.restore();
  }

  // Door Glow (animated)
  ctx.shadowColor = `rgba(56, 189, 248, ${0.4 + breathe * 0.4})`;
  ctx.shadowBlur = 8 + breathe * 6;
  ctx.fillStyle = `rgba(56, 189, 248, ${0.7 + breathe * 0.3})`;
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(labels.entrance, OFFICE_WIDTH / 2, OFFICE_HEIGHT - 15);
  ctx.shadowBlur = 0;
}

/** @deprecated Use drawStaticBackground + drawAnimatedOverlay instead */
export function drawOffice(ctx: CanvasRenderingContext2D, labels: CanvasLabels = DEFAULT_LABELS, time: number = 0) {
  drawStaticBackground(ctx, labels);
  drawAnimatedOverlay(ctx, labels, time);
}
```

- [ ] **Step 2: Add static canvas to engine and update draw logic**

In `src/canvas/engine.ts` constructor, add a third canvas:

```typescript
// After bgCanvas/bgCtx initialization:
this.staticCanvas = document.createElement("canvas");
this.staticCanvas.width = OFFICE_WIDTH;
this.staticCanvas.height = OFFICE_HEIGHT;
this.staticCtx = this.staticCanvas.getContext("2d")!;
this.staticCtx.imageSmoothingEnabled = false;
this.staticReady = false;
```

Add corresponding class fields:

```typescript
private staticCanvas: HTMLCanvasElement;
private staticCtx: CanvasRenderingContext2D;
private staticReady: boolean = false;
```

Update `setLabels` to invalidate static cache:

```typescript
setLabels(labels: CanvasLabels, hudOnline?: string) {
  this.labels = labels;
  if (hudOnline) this.hudOnline = hudOnline;
  this.lastBgRenderTime = 0;
  this.staticReady = false; // Force static redraw on label change
}
```

Update `draw()` background section:

```typescript
// Static background (drawn once)
if (!this.staticReady) {
  this.staticCtx.clearRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
  drawStaticBackground(this.staticCtx, this.labels);
  this.staticReady = true;
}

// Throttled animated overlay
if (now - this.lastBgRenderTime > this.bgThrottleMs) {
  this.bgCtx.clearRect(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
  this.bgCtx.drawImage(this.staticCanvas, 0, 0);
  drawAnimatedOverlay(this.bgCtx, this.labels, now);
  this.lastBgRenderTime = now;
}

ctx.drawImage(this.bgCanvas, 0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
```

Update imports:

```typescript
import {
  drawStaticBackground,
  drawAnimatedOverlay,
  OFFICE_WIDTH,
  OFFICE_HEIGHT,
  // ... rest unchanged
} from "./office";
```

Remove `drawOffice` from imports.

- [ ] **Step 3: Run all tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/canvas/office.ts src/canvas/engine.ts
git commit -m "perf(canvas): split background into static/animated layers, draw gradient+grid once"
```

---

### Task 7: focusAgent smooth transition

Currently `focusAgent()` teleports the viewport instantly. Add easing.

**Files:**
- Modify: `src/canvas/engine.ts` (add focus target, update method, focus method)

- [ ] **Step 1: Add focus target state**

Add class field:

```typescript
private focusTarget: { x: number; y: number; scale: number } | null = null;
```

- [ ] **Step 2: Replace `focusAgent` implementation**

```typescript
focusAgent(agentId: string) {
  const agent = this.agents.get(agentId);
  if (!agent) return;
  const targetScale = 2;
  this.focusTarget = {
    scale: targetScale,
    x: this.canvas.width / 2 - agent.x * targetScale,
    y: this.canvas.height / 2 - agent.y * targetScale,
  };
}
```

- [ ] **Step 3: Add focus easing to `update()`**

Add at the end of `update()`, before the bgThrottleMs line:

```typescript
if (this.focusTarget) {
  const ease = 0.12;
  this.scale += (this.focusTarget.scale - this.scale) * ease;
  this.offsetX += (this.focusTarget.x - this.offsetX) * ease;
  this.offsetY += (this.focusTarget.y - this.offsetY) * ease;
  const done =
    Math.abs(this.focusTarget.scale - this.scale) < 0.01 &&
    Math.abs(this.focusTarget.x - this.offsetX) < 0.5 &&
    Math.abs(this.focusTarget.y - this.offsetY) < 0.5;
  if (done) {
    this.scale = this.focusTarget.scale;
    this.offsetX = this.focusTarget.x;
    this.offsetY = this.focusTarget.y;
    this.focusTarget = null;
  }
}
```

Update bgThrottleMs to also treat focusTarget as active:

```typescript
this.bgThrottleMs = (anyMoving || this.bubbles.length > 0 || this.focusTarget !== null) ? 50 : 200;
```

- [ ] **Step 4: Cancel focus on user interaction**

In `mousedown` handler (~line 93), add:

```typescript
this.focusTarget = null; // Cancel auto-focus on manual interaction
```

In `touchstart` handler (~line 151), add the same.

In `wheel` handler (~line 79), add the same.

- [ ] **Step 5: Run all tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "feat(canvas): smooth viewport transition for focusAgent with easing"
```

---

### Task 8: Extract module-level constants from rendering functions

Arrays like `noteColors`, `bookColors`, `itemColors` in `drawZoneDetails` are re-created every call. Move to module scope.

**Files:**
- Modify: `src/canvas/office.ts:147-338`

- [ ] **Step 1: Extract constant arrays to module level**

Add before `drawZoneDetails` function:

```typescript
const NOTE_COLORS = ["rgba(250, 204, 21, 0.8)", "rgba(248, 113, 113, 0.8)", "rgba(74, 222, 128, 0.8)", "rgba(96, 165, 250, 0.8)"];
const BOOK_COLORS = ["rgba(239, 68, 68, 0.7)", "rgba(59, 130, 246, 0.7)", "rgba(16, 185, 129, 0.7)", "rgba(245, 158, 11, 0.7)", "rgba(139, 92, 246, 0.7)"];
const ITEM_COLORS = ["rgba(250, 204, 21, 0.7)", "rgba(244, 114, 182, 0.7)", "rgba(56, 189, 248, 0.7)"];
const COL_COLORS = ["rgba(250, 204, 21, 0.3)", "rgba(56, 189, 248, 0.3)", "rgba(74, 222, 128, 0.3)"];
```

Replace inline arrays in `drawZoneDetails`:
- `bulletin` case: `noteColors` → `NOTE_COLORS`
- `bookshelf` case: `bookColors` → `BOOK_COLORS`
- `shop` case: `itemColors` → `ITEM_COLORS`
- `taskboard` case: `colColors` → `COL_COLORS`

- [ ] **Step 2: Run all tests**

Run: `node --import tsx --test src/canvas/office.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/canvas/office.ts
git commit -m "refactor(canvas): extract zone decoration constants to module level"
```

---

## Chunk 3: Display Quality & Power Efficiency (P2)

### Task 9: HiDPI / devicePixelRatio support

Canvas doesn't account for Retina displays — text and shapes appear blurry on high-DPI screens.

**Files:**
- Modify: `src/canvas/engine.ts` (resize, draw, mouse coordinate mapping)

- [ ] **Step 1: Add DPI tracking fields**

```typescript
private dpr: number = 1;
private logicalWidth: number = 0;
private logicalHeight: number = 0;
```

- [ ] **Step 2: Update `resize()` for HiDPI**

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
    this.scale = Math.min(width / OFFICE_WIDTH, height / OFFICE_HEIGHT) * 0.9;
    this.offsetX = (width - OFFICE_WIDTH * this.scale) / 2;
    this.offsetY = (height - OFFICE_HEIGHT * this.scale) / 2;
  }

  this.lastBgRenderTime = 0;
}
```

- [ ] **Step 3: Apply DPR scale in `draw()`**

At the start of `draw()`, after clearRect, add DPR scaling:

```typescript
// Before existing ctx.save/translate/scale:
ctx.save();
ctx.scale(this.dpr, this.dpr);
```

And at the very end of `draw()` (after HUD), add matching restore:

```typescript
ctx.restore(); // DPR scale
```

Update clearRect to use physical canvas dimensions:

```typescript
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#020617";
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

- [ ] **Step 4: Update HUD to use logical dimensions**

Replace `canvas.height` in HUD positioning with `this.logicalHeight`:

```typescript
const pillY = this.logicalHeight - pillHeight - 16;
```

- [ ] **Step 5: Update focusAgent to use logical dimensions**

```typescript
focusAgent(agentId: string) {
  const agent = this.agents.get(agentId);
  if (!agent) return;
  const targetScale = 2;
  this.focusTarget = {
    scale: targetScale,
    x: this.logicalWidth / 2 - agent.x * targetScale,
    y: this.logicalHeight / 2 - agent.y * targetScale,
  };
}
```

- [ ] **Step 6: Run all tests, verify manually on Retina display**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

Manual: Open office page on Retina display, verify text is crisp.

- [ ] **Step 7: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "feat(canvas): HiDPI support with devicePixelRatio scaling"
```

---

### Task 10: Idle pause — stop rendering when nothing changes

When no agents move, no bubbles exist, no focus animation, and no user interaction, the loop still runs at 60fps doing full redraws. Add a dirty flag system to pause rendering when idle.

> **Note:** The 2% per-frame roaming probability means scenes with many agents rarely go fully idle. The dirty flag still helps by skipping draws during brief stable windows and when zoomed into a static area. The primary benefit is reducing CPU when the page is in the background or only a few agents are present.

**Files:**
- Modify: `src/canvas/engine.ts`

- [ ] **Step 1: Add dirty tracking fields**

```typescript
private dirty: boolean = true;
private idleFrames: number = 0;
```

- [ ] **Step 2: Mark dirty on all interaction points**

Add `this.dirty = true;` in these handlers:
- `wheel` handler (after scale/offset change)
- `mousedown` handler
- `mousemove` handler (only when hoveredAgent changes)
- `touchstart` handler
- `touchmove` handler

Also in these methods:
- `addBubble()` — after pushing new bubble
- `updateAgents()` — at end of method
- `setLabels()` — already forces bg redraw, add dirty flag
- `resize()` — add dirty flag

- [ ] **Step 3: Add idle detection in render loop**

Modify the `start()` method render loop:

```typescript
start() {
  this.lastBgRenderTime = 0;
  const render = () => {
    this.update();

    // Skip drawing if scene is stable
    const isActive = this.dirty ||
      this.bubbles.length > 0 ||
      this.focusTarget !== null;

    if (isActive) {
      this.draw();
      this.dirty = false;
      this.idleFrames = 0;
    } else {
      this.idleFrames++;
    }

    this.animationId = requestAnimationFrame(render);
  };
  this.animationId = requestAnimationFrame(render);
}
```

In `update()`, set dirty if any agent is moving:

```typescript
private update() {
  let anyMoving = false;
  for (const agent of this.agents.values()) {
    updateAgentPosition(agent);
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    if (dx * dx + dy * dy > 4) anyMoving = true;
  }
  updateBubbles(this.bubbles);

  if (this.focusTarget) {
    // ... existing focus easing code ...
  }

  if (anyMoving) this.dirty = true;

  this.bgThrottleMs = (anyMoving || this.bubbles.length > 0 || this.focusTarget !== null) ? 50 : 200;
}
```

- [ ] **Step 4: Run all tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "perf(canvas): idle pause system, skip draw when scene is static"
```

---

### Task 11: Delta-time animation system

Animations use a per-agent frame counter that increments per draw call, tying animation speed to refresh rate. On 120Hz displays, everything runs 2x faster. Switch to time-based animation.

**Files:**
- Modify: `src/canvas/engine.ts` (pass timestamp through render pipeline)
- Modify: `src/canvas/office.ts` (AgentPosition: add `phaseOffset` field)
- Modify: `src/canvas/sprites.ts` (accept `time` + `phaseOffset` instead of `frame`)
- Modify: `src/components/shop/lobster-preview.tsx` (update `drawLobster` call)
- Modify: `src/canvas/office.test.ts` (update test helper)

- [ ] **Step 1: Add `phase` to AgentPosition, remove `frame` dependency**

In `src/canvas/office.ts`, update the `AgentPosition` interface — add `phaseOffset` and deprecate `frame`:

```typescript
export interface AgentPosition {
  id: string;
  name: string;
  status: string;
  points: number;
  appearance: { color: string; hat: string | null; accessory: string | null };
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  /** @deprecated Kept for backward compat. Rendering uses time + phaseOffset instead. */
  frame: number;
  phaseOffset: number;  // Random offset so agents don't animate in sync
}
```

Update `updateAgents` in engine.ts where agents are created (~line 250):

```typescript
this.agents.set(data.id, {
  // ... existing fields ...
  frame: 0,
  phaseOffset: Math.random() * Math.PI * 2,
});
```

- [ ] **Step 2: Pass render timestamp through draw pipeline**

In `engine.ts`, the `draw()` method already has `const now = Date.now()`. Change the sprite calls to pass `now` and `phaseOffset`:

```typescript
drawLobster(ctx, agent.x, agent.y, agent.appearance, agent.status, now, agent.phaseOffset, spriteScale, isHovered);
drawNameTag(ctx, agent.x, agent.y, agent.name, agent.points, spriteScale, this.scale, isHovered);
```

- [ ] **Step 3: Rewrite `drawLobster` with time-based animation**

Replace the full `drawLobster` function in `src/canvas/sprites.ts`:

```typescript
export function drawLobster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  appearance: LobsterAppearance,
  status: string,
  time: number,
  phaseOffset: number,
  scale: number = 2,
  isHovered: boolean = false
) {
  const s = scale;
  const color = LOBSTER_COLORS[appearance.color] || LOBSTER_COLORS.red;
  const alpha = status === "OFFLINE" ? 0.3 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  const cv = getColorVariants(color);
  const bodyColor = cv.body;
  const darkColor = cv.dark;
  const lightColor = cv.light;

  // Time-based animation: t is in seconds with per-agent phase offset
  const t = time / 1000 + phaseOffset;

  // Conversions from frame-based (at 60fps):
  //   frame * rate  →  t * (rate * 60)
  const bobOffset = Math.sin(t * 4.8) * 1.5 * s;        // was: frame * 0.08
  const drawY = y + bobOffset;

  // 1. Draw Selection/Hover Ring
  if (isHovered && status !== "OFFLINE") {
    const pulse = (Math.sin(time / 200) + 1) / 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 14 * s, 14 * s + pulse * 2 * s, 6 * s + pulse * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(56, 189, 248, ${0.3 + pulse * 0.2})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.6 + pulse * 0.4})`;
    ctx.lineWidth = s * 0.8;
    ctx.stroke();
  }

  // 2. Draw Drop Shadow
  ctx.beginPath();
  ctx.ellipse(x, y + 14 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.globalAlpha = alpha * (1 - (bobOffset + 1.5 * s) / (6 * s));
  ctx.fill();
  ctx.globalAlpha = alpha;

  // Tail
  ctx.fillStyle = darkColor;
  ctx.fillRect(x - 2 * s, drawY + 8 * s, 4 * s, 6 * s);
  ctx.fillRect(x - 4 * s, drawY + 14 * s, 8 * s, 2 * s);

  // Body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 5 * s, drawY - 4 * s, 10 * s, 12 * s);

  // Head
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 6 * s, drawY - 6 * s, 12 * s, 6 * s);

  // Eyes
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 4 * s, drawY - 5 * s, 3 * s, 3 * s);
  ctx.fillRect(x + 1 * s, drawY - 5 * s, 3 * s, 3 * s);
  ctx.fillStyle = "#111111";
  const eyePhase = Math.floor(t * 2) % 4;                // was: Math.floor(frame / 30) % 4
  const eyeOffX = eyePhase === 1 ? s : eyePhase === 3 ? -s : 0;
  ctx.fillRect(x - 3 * s + eyeOffX, drawY - 4 * s, 1.5 * s, 1.5 * s);
  ctx.fillRect(x + 2 * s + eyeOffX, drawY - 4 * s, 1.5 * s, 1.5 * s);

  // Claws
  const clawAngle = Math.sin(t * 3.6) * 0.15;            // was: frame * 0.06
  ctx.fillStyle = lightColor;
  ctx.save();
  ctx.translate(x - 6 * s, drawY);
  ctx.rotate(-0.3 + clawAngle);
  ctx.fillRect(-8 * s, -2 * s, 8 * s, 3 * s);
  ctx.fillRect(-10 * s, -4 * s, 4 * s, 3 * s);
  ctx.fillRect(-10 * s, 1 * s, 4 * s, 3 * s);
  ctx.restore();
  ctx.save();
  ctx.translate(x + 6 * s, drawY);
  ctx.rotate(0.3 - clawAngle);
  ctx.fillRect(0, -2 * s, 8 * s, 3 * s);
  ctx.fillRect(6 * s, -4 * s, 4 * s, 3 * s);
  ctx.fillRect(6 * s, 1 * s, 4 * s, 3 * s);
  ctx.restore();

  // Legs (4 pairs)
  ctx.fillStyle = darkColor;
  for (let i = 0; i < 4; i++) {
    const legY = drawY + i * 2.5 * s;
    const legWiggle = Math.sin(t * 6.0 + i * 0.8) * s;   // was: frame * 0.1
    ctx.fillRect(x - 7 * s + legWiggle, legY, 2 * s, s);
    ctx.fillRect(x + 5 * s - legWiggle, legY, 2 * s, s);
  }

  // Antennae
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = s * 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 3 * s, drawY - 6 * s);
  ctx.quadraticCurveTo(
    x - 6 * s + Math.sin(t * 3.0) * 2 * s,               // was: frame * 0.05
    drawY - 14 * s,
    x - 4 * s + Math.sin(t * 4.2) * 3 * s,               // was: frame * 0.07
    drawY - 16 * s
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 3 * s, drawY - 6 * s);
  ctx.quadraticCurveTo(
    x + 6 * s + Math.sin(t * 3.0 + 1) * 2 * s,           // was: frame * 0.05 + 1
    drawY - 14 * s,
    x + 4 * s + Math.sin(t * 4.2 + 1) * 3 * s,           // was: frame * 0.07 + 1
    drawY - 16 * s
  );
  ctx.stroke();

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

  // Hat
  if (appearance.hat && HAT_SPRITES[appearance.hat]) {
    HAT_SPRITES[appearance.hat](ctx, x, drawY - 6 * s, s);
  }

  // Accessory
  if (appearance.accessory && ACCESSORY_SPRITES[appearance.accessory]) {
    ACCESSORY_SPRITES[appearance.accessory](ctx, x, drawY - 2 * s, s);
  }

  ctx.restore();
}
```

- [ ] **Step 4: Update hover pulse to use same time source**

Replace `Date.now() / 200` with the passed `time / 200` in the hover ring section. (Already done in the complete rewrite above.)

- [ ] **Step 5: Update `lobster-preview.tsx` call site**

In `src/components/shop/lobster-preview.tsx:30`, the signature changed — add `phaseOffset` parameter:

```typescript
// Before:
drawLobster(ctx, size / 2, size / 2, appearance, "ONLINE", 0, scale, false);

// After (add phaseOffset=0 for static preview):
drawLobster(ctx, size / 2, size / 2, appearance, "ONLINE", 0, 0, scale, false);
```

- [ ] **Step 6: Update tests**

Update `src/canvas/office.test.ts` `makeAgent` helper to include `phaseOffset`:

```typescript
function makeAgent(overrides: Partial<AgentPosition> = {}): AgentPosition {
  return {
    // ... existing fields ...
    phaseOffset: 0,
    ...overrides,
  };
}
```

- [ ] **Step 7: Run all tests**

Run: `node --import tsx --test src/canvas/office.test.ts src/canvas/bubbles.test.ts src/canvas/sprites.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Manual verification**

Open office page and verify:
- Animations look smooth and similar speed to before
- Multiple agents animate at different phases (not in sync)
- Resizing window doesn't change animation speed

- [ ] **Step 9: Commit**

```bash
git add src/canvas/engine.ts src/canvas/office.ts src/canvas/sprites.ts src/components/shop/lobster-preview.tsx src/canvas/office.test.ts
git commit -m "feat(canvas): time-based animations, consistent speed across refresh rates"
```

---

## Summary

| Chunk | Tasks | Impact |
|-------|-------|--------|
| **1: GC & Hot Path (P0)** | 1-5 | Eliminate per-frame object allocation, cache expensive computations |
| **2: Rendering & UX (P1)** | 6-8 | Static background layer, smooth focus, constant extraction |
| **3: Quality & Power (P2)** | 9-11 | HiDPI clarity, idle power saving, frame-rate-independent animation |

Expected results:
- **GC pressure**: Near-zero per-frame allocation (from ~N objects/frame to 0)
- **CPU per frame**: ~30% reduction from cached computations
- **Idle power**: Significant reduction when few agents present or page backgrounded
- **Visual quality**: Crisp on Retina, consistent animation speed on all displays
