"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MarkdownContent } from "@/components/content/markdown-content";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT } from "@/i18n";

export type TaskStatus =
  | "OPEN"
  | "CLAIMED"
  | "COMPLETED"
  | "VERIFIED"
  | "CANCELLED";

export type Task = {
  id: string;
  title: string;
  description: string;
  bountyPoints: number;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
  creator: { id: string; name: string };
  assignee: { id: string; name: string } | null;
};

const STEPS: TaskStatus[] = ["OPEN", "CLAIMED", "COMPLETED", "VERIFIED"];
const statusBadgeVariant: Record<TaskStatus, "warning" | "default" | "muted" | "success" | "danger"> = {
  OPEN: "warning",
  CLAIMED: "default",
  COMPLETED: "muted",
  VERIFIED: "success",
  CANCELLED: "danger",
};

function getStepIndex(status: TaskStatus): number {
  if (status === "CANCELLED") return -1;
  const i = STEPS.indexOf(status);
  return i >= 0 ? i : 0;
}

type TaskDetailContentProps = {
  task: Task;
  t: ReturnType<typeof useT>;
  formatTimeAgo: (value: string) => string;
};

export function TaskDetailContent({
  task,
  t,
  formatTimeAgo,
}: TaskDetailContentProps) {
  const currentStep = getStepIndex(task.status);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href="/tasks">
          <Button variant="secondary">{t("tasks.back")}</Button>
        </Link>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{task.title}</h1>
          <Badge variant={statusBadgeVariant[task.status]}>{task.status}</Badge>
        </div>

        <div className="mt-4 flex items-center gap-2 text-accent">
          <span className="text-xl">🪙</span>
          <span className="text-lg font-semibold">{task.bountyPoints} {t("common.pts")}</span>
        </div>

        {task.status !== "CANCELLED" && (
          <div className="mt-6">
            <p className="mb-2 text-sm text-muted">{t("tasks.statusFlow")}</p>
            <div className="flex items-center gap-1">
              {STEPS.map((step, i) => (
                <div key={step} className="flex flex-1 items-center">
                  <div
                    className={`flex h-8 min-w-[4rem] flex-1 items-center justify-center rounded-lg text-xs font-medium ${
                      i <= currentStep
                        ? "bg-accent/20 text-accent"
                        : "bg-card-border/30 text-muted"
                    }`}
                  >
                    {step}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        i < currentStep ? "bg-accent/50" : "bg-card-border/30"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <MarkdownContent content={task.description} />
        </div>

        <div className="mt-6 grid gap-4 border-t border-card-border pt-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">{t("tasks.creatorLabel")}</p>
            <p className="font-medium text-foreground">{task.creator.name}</p>
          </div>
          {task.assignee && (
            <div>
              <p className="text-xs text-muted">{t("tasks.assigneeLabel")}</p>
              <p className="font-medium text-accent-secondary">
                {task.assignee.name}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted">{t("tasks.createdAt")}</p>
            <p className="text-foreground">{formatTimeAgo(task.createdAt)}</p>
          </div>
          {task.completedAt && (
            <div>
              <p className="text-xs text-muted">{t("tasks.completedAt")}</p>
              <p className="text-foreground">
                {formatTimeAgo(task.completedAt)}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function TaskDetailPage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const params = useParams();
  const id = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadTask() {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/tasks/${id}`);
        const json = await response.json();

        if (!json.success) {
          throw new Error(json.error ?? "Failed to load");
        }

        setTask(json.data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Something went wrong");
        setTask(null);
      } finally {
        setLoading(false);
      }
    }

    void loadTask();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-card-border/50" />
        <Card className="animate-pulse">
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-card-border/30" />
            <div className="h-4 w-4/5 rounded bg-card-border/30" />
          </div>
        </Card>
      </div>
    );
  }

  if (loadError || !task) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/tasks">
            <Button variant="secondary">{t("tasks.back")}</Button>
          </Link>
        </div>
        <Card className="py-12 text-center text-danger">
          {loadError ?? t("tasks.notFound")}
        </Card>
      </div>
    );
  }

  return <TaskDetailContent task={task} t={t} formatTimeAgo={formatTimeAgo} />;
}
