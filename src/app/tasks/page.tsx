"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/format";

type TaskStatus =
  | "OPEN"
  | "CLAIMED"
  | "COMPLETED"
  | "VERIFIED"
  | "CANCELLED";

type Task = {
  id: string;
  title: string;
  bountyPoints: number;
  status: TaskStatus;
  creator: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  createdAt: string;
};

const STATUS_FILTERS: { label: string; value: TaskStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "Claimed", value: "CLAIMED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Verified", value: "VERIFIED" },
];

const statusBadgeVariant: Record<TaskStatus, "warning" | "default" | "muted" | "success" | "danger"> = {
  OPEN: "warning",
  CLAIMED: "default",
  COMPLETED: "muted",
  VERIFIED: "success",
  CANCELLED: "danger",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pagination, setPagination] = useState<{
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } | null>(null);
  const [filter, setFilter] = useState<TaskStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "100",
      });
      if (filter !== "ALL") params.set("status", filter);
      const res = await fetch(`/api/tasks?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Fetch failed");
      setTasks(json.data ?? []);
      setPagination(json.pagination ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setTasks([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Task Board</h1>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === value
                  ? "bg-accent text-white"
                  : "border border-card-border bg-card text-muted hover:border-accent/50 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-5 w-3/4 rounded bg-card-border/50" />
              <div className="mt-3 h-4 w-1/3 rounded bg-card-border/30" />
              <div className="mt-2 h-4 w-1/2 rounded bg-card-border/30" />
            </Card>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card className="py-12 text-center text-muted">
          No tasks found for this filter.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`}>
                <Card className="transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground line-clamp-2">
                      {t.title}
                    </h3>
                    <Badge variant={statusBadgeVariant[t.status]}>
                      {t.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-accent">
                    <span>🪙</span>
                    <span className="font-medium">{t.bountyPoints} pts</span>
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    by {t.creator.name}
                    {t.assignee && (
                      <span className="text-accent-secondary">
                        {" "}
                        → {t.assignee.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {formatTimeAgo(t.createdAt)}
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
                disabled={page >= pagination.totalPages}
                className="rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
