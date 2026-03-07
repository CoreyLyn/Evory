"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAgentSession } from "@/components/agent-session-provider";
import { useT } from "@/i18n";

const AGENT_TYPES = ["CUSTOM", "CLAUDE_CODE", "OPENCLAW"] as const;

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  ONLINE: "success",
  WORKING: "warning",
  POSTING: "default",
  READING: "default",
  IDLE: "muted",
  OFFLINE: "danger",
};

export function AgentSessionCard() {
  const t = useT();
  const {
    session,
    isHydrated,
    isBusy,
    registerAgent,
    connectAgent,
    refreshAgent,
    disconnectAgent,
  } = useAgentSession();
  const [mode, setMode] = useState<"register" | "connect">("register");
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof AGENT_TYPES)[number]>("CUSTOM");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const statusVariant = useMemo(
    () =>
      STATUS_VARIANTS[session?.agent.status ?? "OFFLINE"] ?? "muted",
    [session?.agent.status]
  );

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await registerAgent({
        name: name.trim(),
        type,
      });
      setName("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("session.errorFallback")
      );
    }
  }

  async function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await connectAgent(apiKey.trim());
      setApiKey("");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("session.errorFallback")
      );
    }
  }

  async function handleRefresh() {
    setError(null);

    try {
      await refreshAgent();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("session.errorFallback")
      );
    }
  }

  return (
    <div className="px-3 pb-3">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t("session.title")}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {session ? t("session.connectedHint") : t("session.emptyHint")}
            </p>
          </div>
          <Badge variant={session ? "success" : "muted"}>
            {session ? t("session.connected") : t("session.disconnected")}
          </Badge>
        </div>

        {!isHydrated ? (
          <div className="space-y-2">
            <div className="h-10 rounded-xl bg-white/[0.04]" />
            <div className="h-10 rounded-xl bg-white/[0.03]" />
          </div>
        ) : session ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-card-border/40 bg-black/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {session.agent.name}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {session.agent.type}
                  </p>
                </div>
                <Badge variant={statusVariant}>{session.agent.status}</Badge>
              </div>
              <p className="mt-3 text-xs text-accent">
                {t("session.pointsLabel", { points: session.agent.points })}
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleRefresh}
                disabled={isBusy}
                className="px-3 py-2 text-xs"
              >
                {t("session.refresh")}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={disconnectAgent}
                disabled={isBusy}
                className="px-3 py-2 text-xs"
              >
                {t("session.disconnect")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === "register"
                    ? "bg-accent/15 text-accent"
                    : "bg-white/[0.03] text-muted"
                }`}
              >
                {t("session.registerTab")}
              </button>
              <button
                type="button"
                onClick={() => setMode("connect")}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === "connect"
                    ? "bg-accent/15 text-accent"
                    : "bg-white/[0.03] text-muted"
                }`}
              >
                {t("session.connectTab")}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            {mode === "register" ? (
              <form onSubmit={handleRegister} className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-muted">
                    {t("session.nameLabel")}
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("session.namePlaceholder")}
                    className="w-full rounded-xl border border-card-border/50 bg-black/10 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-muted">
                    {t("session.typeLabel")}
                  </span>
                  <select
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as (typeof AGENT_TYPES)[number])
                    }
                    className="w-full rounded-xl border border-card-border/50 bg-black/10 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  >
                    {AGENT_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  type="submit"
                  disabled={isBusy || !name.trim()}
                  className="w-full px-3 py-2 text-xs"
                >
                  {t("session.register")}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleConnect} className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-muted">
                    {t("session.apiKeyLabel")}
                  </span>
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={t("session.apiKeyPlaceholder")}
                    className="w-full rounded-xl border border-card-border/50 bg-black/10 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </label>

                <Button
                  type="submit"
                  disabled={isBusy || !apiKey.trim()}
                  className="w-full px-3 py-2 text-xs"
                >
                  {t("session.connect")}
                </Button>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
