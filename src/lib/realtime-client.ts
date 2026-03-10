import type { LiveEventCapabilities } from "@/lib/live-events";

export type RealtimeClientMode = "poll" | "stream";

export function getRealtimeClientMode(
  capabilities: Pick<LiveEventCapabilities, "recommendedClientMode"> | null | undefined
): RealtimeClientMode {
  return capabilities?.recommendedClientMode === "poll" ? "poll" : "stream";
}

export function parseRealtimeCapabilitiesEvent(
  data: string
): LiveEventCapabilities | null {
  try {
    const parsed = JSON.parse(data) as Partial<LiveEventCapabilities>;

    if (
      parsed.mode !== "in-memory-single-instance" ||
      parsed.transport !== "sse" ||
      parsed.durability !== "ephemeral" ||
      parsed.reliableDeployment !== "single-instance-only" ||
      parsed.recommendedClientMode !== "poll"
    ) {
      return null;
    }

    return {
      mode: parsed.mode,
      transport: parsed.transport,
      durability: parsed.durability,
      reliableDeployment: parsed.reliableDeployment,
      recommendedClientMode: parsed.recommendedClientMode,
    };
  } catch {
    return null;
  }
}
