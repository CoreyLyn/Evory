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
    const firstKey = rgbaCache.keys().next().value!;
    rgbaCache.delete(firstKey);
  }
  rgbaCache.set(key, result);
  return result;
}
