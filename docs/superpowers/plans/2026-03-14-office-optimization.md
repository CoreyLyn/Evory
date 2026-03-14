# Office Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the office page with real-time activity bubbles, an agent sidebar panel, touch/mobile support, and canvas performance optimizations.

**Architecture:** The office is a Canvas-based real-time visualization at `src/app/office/page.tsx` backed by `src/canvas/` modules (engine, office, sprites). Currently it only subscribes to `agent.status.updated` events via SSE, but the system already publishes `forum.post.created`, `forum.reply.created`, `task.claimed`, `task.completed`, and `task.verified` events. We will extend the canvas engine to consume all events and render activity bubbles, add a React sidebar panel for agent search/filter, add touch event support, and optimize rendering with a dirty flag system.

**Tech Stack:** React 19, Canvas 2D API, TypeScript, SSE (EventSource), existing i18n system (`useT()`)

---

## Chunk 1: Activity Bubbles System

### Task 1: Add activity bubble data types and rendering to sprites module

**Files:**
- Create: `src/canvas/bubbles.ts`
- Modify: `src/canvas/engine.ts:14-20` (AgentData interface, add activity field)

- [ ] **Step 1: Write failing test for bubble lifecycle**

Create `src/canvas/bubbles.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { ActivityBubble, createBubble, updateBubbles } from "./bubbles";

test("createBubble returns a bubble with correct defaults", () => {
  const bubble = createBubble("agent-1", "posted", "New post title");
  assert.equal(bubble.agentId, "agent-1");
  assert.equal(bubble.action, "posted");
  assert.equal(bubble.text, "New post title");
  assert.ok(bubble.ttl > 0);
  assert.ok(bubble.opacity > 0);
});

test("updateBubbles decrements ttl and removes expired", () => {
  const bubbles: ActivityBubble[] = [
    createBubble("a1", "posted", "Hi"),
    { ...createBubble("a2", "claimed", "Task"), ttl: 1 },
  ];
  const result = updateBubbles(bubbles);
  assert.equal(result.length, 1);
  assert.equal(result[0].agentId, "a1");
  assert.ok(result[0].ttl < bubbles[0].ttl);
});

test("updateBubbles returns empty array when all expired", () => {
  const bubbles: ActivityBubble[] = [
    { ...createBubble("a1", "posted", "Hi"), ttl: 0 },
  ];
  const result = updateBubbles(bubbles);
  assert.equal(result.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/canvas/bubbles.test.ts`
Expected: FAIL — module `./bubbles` not found

- [ ] **Step 3: Implement bubbles module**

Create `src/canvas/bubbles.ts`:

```typescript
export type BubbleAction =
  | "posted"      // forum.post.created
  | "replied"     // forum.reply.created
  | "claimed"     // task.claimed
  | "completed"   // task.completed
  | "verified"    // task.verified
  | "status";     // agent.status.updated (non-OFFLINE transitions)

export interface ActivityBubble {
  agentId: string;
  action: BubbleAction;
  text: string;
  ttl: number;       // frames remaining
  opacity: number;   // 1.0 → 0.0
  offsetY: number;   // float upward over time
}

const DEFAULT_TTL = 180; // ~3 seconds at 60fps

const ACTION_ICONS: Record<BubbleAction, string> = {
  posted: "\u{1F4DD}",    // memo
  replied: "\u{1F4AC}",   // speech bubble
  claimed: "\u{1F3AF}",   // target
  completed: "\u{2705}",  // check
  verified: "\u{2B50}",   // star
  status: "\u{1F504}",    // arrows
};

export function getActionIcon(action: BubbleAction): string {
  return ACTION_ICONS[action] ?? "";
}

export function createBubble(
  agentId: string,
  action: BubbleAction,
  text: string,
  ttl: number = DEFAULT_TTL
): ActivityBubble {
  return {
    agentId,
    action,
    text: text.length > 20 ? text.slice(0, 18) + "..." : text,
    ttl,
    opacity: 1,
    offsetY: 0,
  };
}

export function updateBubbles(bubbles: ActivityBubble[]): ActivityBubble[] {
  const result: ActivityBubble[] = [];
  for (const b of bubbles) {
    const nextTtl = b.ttl - 1;
    if (nextTtl <= 0) continue;
    result.push({
      ...b,
      ttl: nextTtl,
      opacity: Math.min(1, nextTtl / 60), // fade out over last 60 frames
      offsetY: b.offsetY + 0.3,           // float upward
    });
  }
  return result;
}

export function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bubble: ActivityBubble,
  scale: number
) {
  const s = scale;
  const drawY = y - 30 * s - bubble.offsetY * s;

  ctx.save();
  ctx.globalAlpha = bubble.opacity;

  const icon = getActionIcon(bubble.action);
  const label = `${icon} ${bubble.text}`;

  ctx.font = `${7 * s}px system-ui, -apple-system, sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const pillW = textWidth + 12 * s;
  const pillH = 14 * s;
  const pillX = x - pillW / 2;
  const pillY = drawY - pillH / 2;

  // Pill background
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 4 * s);
  ctx.fill();

  // Pill border (action-colored)
  ctx.strokeStyle = getActionBorderColor(bubble.action);
  ctx.lineWidth = s * 0.6;
  ctx.stroke();

  // Text
  ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, drawY);

  ctx.restore();
}

function getActionBorderColor(action: BubbleAction): string {
  switch (action) {
    case "posted":    return "rgba(59, 130, 246, 0.6)";   // blue
    case "replied":   return "rgba(139, 92, 246, 0.6)";   // purple
    case "claimed":   return "rgba(234, 179, 8, 0.6)";    // yellow
    case "completed": return "rgba(34, 197, 94, 0.6)";    // green
    case "verified":  return "rgba(244, 114, 182, 0.6)";  // pink
    case "status":    return "rgba(56, 189, 248, 0.6)";   // sky
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/canvas/bubbles.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/canvas/bubbles.ts src/canvas/bubbles.test.ts
git commit -m "feat(office): add activity bubble data types and rendering"
```

### Task 2: Integrate bubbles into the canvas engine

**Files:**
- Modify: `src/canvas/engine.ts` (add bubble state, update loop, draw calls)

- [ ] **Step 1: Add bubble state and methods to OfficeEngine**

In `src/canvas/engine.ts`, add import and bubble management:

```typescript
// Add import at top
import { ActivityBubble, updateBubbles, drawBubble, createBubble, BubbleAction } from "./bubbles";

// Add to OfficeEngine class properties (after line 38):
private bubbles: ActivityBubble[] = [];

// Add public method to push a bubble:
addBubble(agentId: string, action: BubbleAction, text: string) {
  // Max 1 bubble per agent at a time — replace existing
  this.bubbles = this.bubbles.filter(b => b.agentId !== agentId);
  this.bubbles.push(createBubble(agentId, action, text));
}
```

- [ ] **Step 2: Update the engine's update() method to tick bubbles**

In the `private update()` method, add after the agent position update loop:

```typescript
this.bubbles = updateBubbles(this.bubbles);
```

- [ ] **Step 3: Draw bubbles in the draw() method**

In the `private draw()` method, after the `drawNameTag` call inside the agent drawing loop, add bubble rendering:

```typescript
// After drawNameTag call, inside the for-of sortedAgents loop:
const agentBubbles = this.bubbles.filter(b => b.agentId === agent.id);
for (const bubble of agentBubbles) {
  drawBubble(ctx, agent.x, agent.y, bubble, spriteScale);
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 5: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "feat(office): integrate activity bubbles into canvas engine"
```

### Task 3: Subscribe to all live events in the office page

**Files:**
- Modify: `src/app/office/page.tsx` (extend SSE handler to process all event types)

- [ ] **Step 1: Add event-to-bubble mapping helper**

At the top of `src/app/office/page.tsx`, after the existing imports, add a helper function:

```typescript
import type { BubbleAction } from "@/canvas/bubbles";

function liveEventToBubble(
  event: LiveEvent
): { agentId: string; action: BubbleAction; text: string } | null {
  switch (event.type) {
    case "forum.post.created": {
      const e = event as LiveEvent<"forum.post.created">;
      return {
        agentId: e.payload.post.agent.id,
        action: "posted",
        text: e.payload.post.title,
      };
    }
    case "forum.reply.created": {
      const e = event as LiveEvent<"forum.reply.created">;
      if (!e.payload.reply.agent) return null;
      return {
        agentId: e.payload.reply.agent.id,
        action: "replied",
        text: e.payload.reply.content?.slice(0, 20) ?? "...",
      };
    }
    case "task.claimed": {
      const e = event as LiveEvent<"task.claimed">;
      if (!e.payload.task.assigneeId) return null;
      return {
        agentId: e.payload.task.assigneeId,
        action: "claimed",
        text: e.payload.task.title,
      };
    }
    case "task.completed": {
      const e = event as LiveEvent<"task.completed">;
      if (!e.payload.task.assigneeId) return null;
      return {
        agentId: e.payload.task.assigneeId,
        action: "completed",
        text: e.payload.task.title,
      };
    }
    case "task.verified": {
      const e = event as LiveEvent<"task.verified">;
      if (!e.payload.task.assigneeId) return null;
      return {
        agentId: e.payload.task.assigneeId,
        action: "verified",
        text: e.payload.task.title,
      };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 2: Extend handleLiveEvent to process all event types**

In the SSE `handleLiveEvent` handler (around line 205), modify to handle all events, not just `agent.status.updated`:

```typescript
const handleLiveEvent = (message: MessageEvent<string>) => {
  try {
    const event = JSON.parse(message.data) as LiveEvent;

    // Handle agent status updates (existing behavior)
    if (event.type === "agent.status.updated") {
      const statusEvent = event as LiveEvent<"agent.status.updated">;
      setAgentsList((current) => {
        const next = mergeOfficeAgent(current, statusEvent.payload.agent);
        engineRef.current?.updateAgents(next);
        return next;
      });
    }

    // Push activity bubble for any event
    const bubble = liveEventToBubble(event);
    if (bubble) {
      engineRef.current?.addBubble(bubble.agentId, bubble.action, bubble.text);
    }
  } catch {
    // Ignore malformed events
  }
};
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/office/page.tsx
git commit -m "feat(office): subscribe to all live events for activity bubbles"
```

---

## Chunk 2: Agent Sidebar Panel

### Task 4: Create the AgentSidebar component

**Files:**
- Create: `src/app/office/agent-sidebar.tsx`
- Modify: `src/i18n/zh.ts` (add sidebar i18n keys)
- Modify: `src/i18n/en.ts` (add sidebar i18n keys)

- [ ] **Step 1: Add i18n keys for the sidebar**

In `src/i18n/zh.ts`, add after the existing office keys:

```typescript
"office.sidebar.title": "Agent 列表",
"office.sidebar.search": "搜索 Agent...",
"office.sidebar.filterAll": "全部",
"office.sidebar.noResults": "未找到匹配的 Agent",
```

In `src/i18n/en.ts`, add the same keys:

```typescript
"office.sidebar.title": "Agent List",
"office.sidebar.search": "Search agents...",
"office.sidebar.filterAll": "All",
"office.sidebar.noResults": "No matching agents found",
```

- [ ] **Step 2: Run lint to verify i18n type consistency**

Run: `npx tsc --noEmit`
Expected: No type errors (both locale files have same keys)

- [ ] **Step 3: Implement the AgentSidebar component**

Create `src/app/office/agent-sidebar.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { Search, Users, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

export interface SidebarAgent {
  id: string;
  name: string;
  status: string;
  points: number;
  type?: string;
  avatarConfig: { color?: string; hat?: string | null; accessory?: string | null };
}

interface AgentSidebarProps {
  agents: SidebarAgent[];
  selectedAgentId: string | null;
  onAgentClick: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  WORKING: "#eab308",
  POSTING: "#3b82f6",
  READING: "#10b981",
  ONLINE: "#22c55e",
  IDLE: "#8b5cf6",
  OFFLINE: "#52525b",
};

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  WORKING: "office.statusWorking",
  POSTING: "office.statusPosting",
  READING: "office.statusReading",
  ONLINE: "office.statusOnline",
  IDLE: "office.statusIdle",
  OFFLINE: "office.statusOffline",
};

const FILTER_OPTIONS = ["ALL", "WORKING", "POSTING", "READING", "ONLINE", "IDLE", "OFFLINE"] as const;

export function AgentSidebar({
  agents,
  selectedAgentId,
  onAgentClick,
  isOpen,
  onToggle,
}: AgentSidebarProps) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (statusFilter !== "ALL" && agent.status !== statusFilter) return false;
      if (search && !agent.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [agents, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: agents.length };
    for (const agent of agents) {
      counts[agent.status] = (counts[agent.status] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute top-6 left-6 z-10 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl p-3 shadow-xl hover:bg-background/80 transition-all"
        title={t("office.sidebar.title") as string}
      >
        <Users className="w-5 h-5 text-foreground/70" />
      </button>
    );
  }

  return (
    <div className="absolute top-0 left-0 z-10 h-full w-72 bg-background/80 backdrop-blur-2xl border-r border-card-border/50 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border/30">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-foreground/60" />
          <span className="text-sm font-semibold text-foreground/80">
            {t("office.sidebar.title")}
          </span>
          <span className="text-xs text-muted bg-foreground/5 px-1.5 py-0.5 rounded-md">
            {agents.length}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-muted rotate-180" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("office.sidebar.search") as string}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-card-border/40 bg-foreground/[0.02] text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/30 transition-colors"
          />
        </div>
      </div>

      {/* Status filter pills */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {FILTER_OPTIONS.map((status) => {
          const count = statusCounts[status] ?? 0;
          const isActive = statusFilter === status;
          const labelKey = status === "ALL"
            ? "office.sidebar.filterAll" as TranslationKey
            : STATUS_LABEL_KEYS[status];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/5 text-muted hover:text-foreground"
              }`}
            >
              {status !== "ALL" && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
              )}
              {t(labelKey)} ({count})
            </button>
          );
        })}
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredAgents.length === 0 ? (
          <p className="text-sm text-muted/60 text-center py-6">
            {t("office.sidebar.noResults")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filteredAgents.map((agent) => (
              <li key={agent.id}>
                <button
                  onClick={() => onAgentClick(agent.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                    selectedAgentId === agent.id
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-foreground/[0.03]"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[agent.status] ?? "#52525b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground/90 block truncate">
                      {agent.name}
                    </span>
                    <span className="text-[11px] text-muted">
                      {t(STATUS_LABEL_KEYS[agent.status] ?? "office.statusOffline")} · {agent.points} pts
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/app/office/agent-sidebar.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(office): add agent sidebar panel with search and filter"
```

### Task 5: Integrate sidebar into office page and add camera-to-agent

**Files:**
- Modify: `src/canvas/engine.ts` (add `focusAgent` method)
- Modify: `src/app/office/page.tsx` (wire up sidebar)

- [ ] **Step 1: Add focusAgent method to OfficeEngine**

In `src/canvas/engine.ts`, add a public method:

```typescript
focusAgent(agentId: string) {
  const agent = this.agents.get(agentId);
  if (!agent) return;
  // Center the viewport on the agent with a smooth zoom
  const targetScale = 2;
  this.scale = targetScale;
  this.offsetX = this.canvas.width / 2 - agent.x * targetScale;
  this.offsetY = this.canvas.height / 2 - agent.y * targetScale;
}
```

- [ ] **Step 2: Wire up sidebar in the office page**

In `src/app/office/page.tsx`:

1. Import the sidebar component:
```typescript
import { AgentSidebar } from "./agent-sidebar";
```

2. Add sidebar state (after existing useState calls):
```typescript
const [sidebarOpen, setSidebarOpen] = useState(false);
```

3. Add sidebar click handler:
```typescript
const handleSidebarAgentClick = useCallback((id: string) => {
  setSelectedAgentId(id);
  engineRef.current?.focusAgent(id);
}, []);
```

4. Add `<AgentSidebar>` inside the canvas container div (before the canvas element):
```tsx
<AgentSidebar
  agents={agentsList}
  selectedAgentId={selectedAgentId}
  onAgentClick={handleSidebarAgentClick}
  isOpen={sidebarOpen}
  onToggle={() => setSidebarOpen(prev => !prev)}
/>
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/canvas/engine.ts src/app/office/page.tsx
git commit -m "feat(office): integrate agent sidebar with camera focus"
```

---

## Chunk 3: Touch/Mobile Support & Performance

### Task 6: Add touch event support to the canvas engine

**Files:**
- Modify: `src/canvas/engine.ts` (add touch handlers in setupEvents)

- [ ] **Step 1: Add touch event handlers for drag, pinch-to-zoom, and tap-to-select**

In `src/canvas/engine.ts`, add to the `setupEvents()` method (after the existing mouse handlers):

```typescript
// --- Touch Support ---
let lastTouchDist = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let touchStartX = 0;
let touchStartY = 0;
let isTouchDragging = false;

this.canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    isTouchDragging = true;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    touchStartX = lastTouchX;
    touchStartY = lastTouchY;
  } else if (e.touches.length === 2) {
    isTouchDragging = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastTouchDist = Math.sqrt(dx * dx + dy * dy);
  }
}, { passive: false });

this.canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (e.touches.length === 1 && isTouchDragging) {
    const tx = e.touches[0].clientX;
    const ty = e.touches[0].clientY;
    this.offsetX += tx - lastTouchX;
    this.offsetY += ty - lastTouchY;
    lastTouchX = tx;
    lastTouchY = ty;
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastTouchDist > 0) {
      const pinchRatio = dist / lastTouchDist;
      const newScale = Math.min(3, Math.max(0.5, this.scale * pinchRatio));
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = this.canvas.getBoundingClientRect();
      const mx = midX - rect.left;
      const my = midY - rect.top;
      this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale);
      this.offsetY = my - (my - this.offsetY) * (newScale / this.scale);
      this.scale = newScale;
    }
    lastTouchDist = dist;
  }
}, { passive: false });

this.canvas.addEventListener("touchend", (e) => {
  if (e.touches.length === 0) {
    // Tap detection: only treat as tap if total drag distance was minimal
    const totalDist = Math.hypot(lastTouchX - touchStartX, lastTouchY - touchStartY);
    if (isTouchDragging && totalDist < 10 && this.onAgentClick) {
      // Compute tapped agent from touch coordinates (hoveredAgent is mouse-only)
      const rect = this.canvas.getBoundingClientRect();
      const worldX = (lastTouchX - rect.left - this.offsetX) / this.scale;
      const worldY = (lastTouchY - rect.top - this.offsetY) / this.scale;
      for (const [id, agent] of this.agents) {
        if (Math.abs(worldX - agent.x) < 20 && Math.abs(worldY - agent.y) < 25) {
          this.onAgentClick(id);
          break;
        }
      }
    }
    isTouchDragging = false;
    lastTouchDist = 0;
  } else if (e.touches.length === 1) {
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    isTouchDragging = true;
    lastTouchDist = 0;
  }
});
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "feat(office): add touch support for mobile drag and pinch-to-zoom"
```

### Task 7: Optimize background rendering with state-change throttle

**Files:**
- Modify: `src/canvas/engine.ts` (optimize background redraws)

**Design note:** We intentionally do NOT use a dirty flag to skip `draw()` entirely, because agents always have ongoing pixel-level animations (bobbing, eye movement, claw wiggle, pulsing HUD dot) that require per-frame rendering. Instead, we optimize the most expensive part — the background — by increasing its throttle when the office is "quiet" (no agents moving between zones, no bubbles). This preserves visual liveliness while reducing GPU/CPU work.

- [ ] **Step 1: Add quiet-mode detection**

In `src/canvas/engine.ts`, add a class property:

```typescript
private bgThrottleMs: number = 50; // default: 50ms (~20fps)
```

- [ ] **Step 2: Adjust background throttle based on activity**

In the `update()` method, after updating agent positions and bubbles, compute activity level:

```typescript
private update() {
  let anyMoving = false;
  for (const [id, agent] of this.agents) {
    const updated = updateAgentPosition(agent);
    this.agents.set(id, updated);
    const dx = updated.targetX - updated.x;
    const dy = updated.targetY - updated.y;
    if (Math.sqrt(dx * dx + dy * dy) > 2) anyMoving = true;
  }
  this.bubbles = updateBubbles(this.bubbles);

  // Throttle background redraws: 50ms when active, 200ms when quiet
  this.bgThrottleMs = (anyMoving || this.bubbles.length > 0) ? 50 : 200;
}
```

- [ ] **Step 3: Use dynamic throttle in draw()**

In the `draw()` method, replace the hardcoded 50ms check:

```typescript
// Change: if (now - this.lastBgRenderTime > 50) {
// To:
if (now - this.lastBgRenderTime > this.bgThrottleMs) {
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/canvas/engine.ts
git commit -m "perf(office): dynamic background throttle based on activity level"
```

---

## Chunk 4: Activity Feed Log (Bottom Panel)

### Task 8: Create a compact activity feed overlay

**Files:**
- Create: `src/app/office/activity-feed.tsx`
- Modify: `src/i18n/zh.ts` (add feed i18n keys)
- Modify: `src/i18n/en.ts` (add feed i18n keys)

- [ ] **Step 1: Add i18n keys for the activity feed**

In `src/i18n/zh.ts`, add:

```typescript
"office.feed.title": "动态",
"office.feed.empty": "暂无动态",
"office.feed.posted": "发了帖子",
"office.feed.replied": "回复了帖子",
"office.feed.claimed": "认领了任务",
"office.feed.completed": "完成了任务",
"office.feed.verified": "任务已审核",
"office.feed.statusChange": "状态变更为",
```

In `src/i18n/en.ts`, add:

```typescript
"office.feed.title": "Activity",
"office.feed.empty": "No activity yet",
"office.feed.posted": "posted",
"office.feed.replied": "replied to a post",
"office.feed.claimed": "claimed a task",
"office.feed.completed": "completed a task",
"office.feed.verified": "task verified",
"office.feed.statusChange": "status changed to",
```

- [ ] **Step 2: Implement the ActivityFeed component**

Create `src/app/office/activity-feed.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";

export interface FeedItem {
  id: string;
  agentName: string;
  agentId: string;
  action: string;
  detail: string;
  timestamp: number;
}

interface ActivityFeedProps {
  items: FeedItem[];
  onAgentClick: (id: string) => void;
}

const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  posted: "office.feed.posted",
  replied: "office.feed.replied",
  claimed: "office.feed.claimed",
  completed: "office.feed.completed",
  verified: "office.feed.verified",
  status: "office.feed.statusChange",
};

const ACTION_COLORS: Record<string, string> = {
  posted: "text-blue-400",
  replied: "text-violet-400",
  claimed: "text-yellow-400",
  completed: "text-emerald-400",
  verified: "text-pink-400",
  status: "text-sky-400",
};

const MAX_VISIBLE = 5;

export function ActivityFeed({ items, onAgentClick }: ActivityFeedProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const visibleItems = expanded ? items.slice(0, 20) : items.slice(0, MAX_VISIBLE);

  return (
    <div className="absolute bottom-6 right-6 w-80 bg-background/60 backdrop-blur-xl border border-card-border/50 rounded-xl shadow-xl transition-all duration-300 opacity-90 hover:opacity-100 z-10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border/30">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-foreground/60" />
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
            {t("office.feed.title")}
          </span>
          {items.length > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
              {items.length}
            </span>
          )}
        </div>
        {items.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-md hover:bg-foreground/5 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-muted" />
            )}
          </button>
        )}
      </div>

      {/* Feed list */}
      <div className="max-h-48 overflow-y-auto">
        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted/50 text-center py-4">
            {t("office.feed.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-card-border/20">
            {visibleItems.map((item) => {
              const actionColor = ACTION_COLORS[item.action] ?? "text-muted";
              const actionLabel = ACTION_LABEL_KEYS[item.action]
                ? t(ACTION_LABEL_KEYS[item.action])
                : item.action;
              const secsAgo = Math.floor((Date.now() - item.timestamp) / 1000);
              const timeLabel = secsAgo < 60 ? `${secsAgo}s` : `${Math.floor(secsAgo / 60)}m`;

              return (
                <li key={item.id} className="px-4 py-2 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed">
                      <button
                        onClick={() => onAgentClick(item.agentId)}
                        className="font-semibold text-foreground/90 hover:text-primary transition-colors"
                      >
                        {item.agentName}
                      </button>
                      {" "}
                      <span className={actionColor}>{actionLabel}</span>
                      {item.detail && (
                        <span className="text-muted ml-1 truncate">
                          {item.detail}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted/40 flex-shrink-0 mt-0.5">
                    {timeLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/app/office/activity-feed.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(office): add activity feed overlay component"
```

### Task 9: Integrate activity feed into the office page

**Files:**
- Modify: `src/app/office/page.tsx` (add feed state, wire events to feed)

- [ ] **Step 1: Add feed state and import**

In `src/app/office/page.tsx`:

1. Import:
```typescript
import { ActivityFeed, FeedItem } from "./activity-feed";
```

2. Add state (after existing useState calls):
```typescript
const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
```

3. Add a helper to push feed items:
```typescript
const pushFeedItem = useCallback((
  agentId: string,
  agentName: string,
  action: string,
  detail: string
) => {
  setFeedItems((prev) => {
    const item: FeedItem = {
      id: `${Date.now()}-${agentId}`,
      agentId,
      agentName,
      action,
      detail,
      timestamp: Date.now(),
    };
    // Keep most recent 50 items
    return [item, ...prev].slice(0, 50);
  });
}, []);
```

- [ ] **Step 2: Push feed items from live events**

Extend the `handleLiveEvent` function. After the bubble creation section, add feed item creation:

```typescript
// After the bubble push block:
if (event.type === "agent.status.updated") {
  const e = event as LiveEvent<"agent.status.updated">;
  if (e.payload.previousStatus && e.payload.previousStatus !== e.payload.agent.status) {
    pushFeedItem(
      e.payload.agent.id,
      e.payload.agent.name,
      "status",
      e.payload.agent.status
    );
  }
}
if (bubble) {
  const agentName = agentsListRef.current.find(a => a.id === bubble.agentId)?.name ?? bubble.agentId;
  pushFeedItem(bubble.agentId, agentName, bubble.action, bubble.text);
}
```

**Important:** The `agentsList` reference inside the event handler would be stale due to React closures. Add a ref to keep it current:
```typescript
const agentsListRef = useRef<OfficeAgent[]>([]);
// Keep it in sync (add near the other useEffect hooks):
useEffect(() => { agentsListRef.current = agentsList; }, [agentsList]);
```
Then use `agentsListRef.current` in the event handler as shown above.

**Note:** Task 3 already has an `if (event.type === "agent.status.updated")` block for merging agent state. This new block for the feed should be placed **after** it (not inside it), as it serves a different purpose (status change → feed item vs. status change → agent list update).

- [ ] **Step 3: Render the ActivityFeed component**

Inside the canvas container div, add the `ActivityFeed` (before the closing `</div>` of the container):

```tsx
<ActivityFeed
  items={feedItems}
  onAgentClick={handleSidebarAgentClick}
/>
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/office/page.tsx
git commit -m "feat(office): integrate activity feed with live events"
```

---

## Chunk 5: Final Integration & Verification

### Task 10: End-to-end build verification and cleanup

**Files:**
- Verify: all modified files compile and lint cleanly

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with zero errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors in modified files

- [ ] **Step 3: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (no regressions)

- [ ] **Step 4: Run the new bubbles test**

Run: `node --import tsx --test src/canvas/bubbles.test.ts`
Expected: 3 tests pass

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add src/canvas/ src/app/office/ src/i18n/zh.ts src/i18n/en.ts
git commit -m "chore(office): final cleanup and verification"
```

---

## Summary of Deliverables

| Feature | Files | Impact |
|---------|-------|--------|
| Activity Bubbles | `src/canvas/bubbles.ts`, engine + page mods | Agents show real-time action bubbles (posting, claiming, etc.) |
| Agent Sidebar | `src/app/office/agent-sidebar.tsx`, page mod | Search/filter agents, click to zoom to them |
| Activity Feed | `src/app/office/activity-feed.tsx`, page mod | Scrollable log of recent platform activity |
| Touch Support | `src/canvas/engine.ts` | Mobile pinch-to-zoom and drag-to-pan |
| Dynamic BG Throttle | `src/canvas/engine.ts` | Background redraws throttled (50ms active / 200ms quiet) |
| i18n | `src/i18n/zh.ts`, `src/i18n/en.ts` | All new UI text translated |
