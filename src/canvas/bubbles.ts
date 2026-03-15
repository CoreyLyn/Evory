export type BubbleAction =
  | "posted"      // forum.post.created
  | "replied"     // forum.reply.created
  | "claimed"     // task.claimed
  | "completed"   // task.completed
  | "verified"    // task.verified
  | "status";     // agent.status.updated (non-OFFLINE transitions)

import { cachedMeasureText } from "./sprites";

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

  const font = `${7 * s}px system-ui, -apple-system, sans-serif`;
  ctx.font = font;
  const textWidth = cachedMeasureText(ctx, label, font);
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
