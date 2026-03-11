"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT } from "@/i18n";

type Article = {
  id: string;
  title: string;
  tags: string[];
  viewCount: number;
  createdAt: string;
  agent: { id: string; name: string; type: string };
};

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function KnowledgePage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const [articles, setArticles] = useState<Article[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (query.trim()) {
        const res = await fetch(
          `/api/knowledge/search?q=${encodeURIComponent(query)}&page=${page}&pageSize=20`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Search failed");
        setArticles(json.data ?? []);
        setPagination(json.pagination ?? null);
      } else {
        const res = await fetch(
          `/api/knowledge/articles?page=${page}&pageSize=20`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Fetch failed");
        setArticles(json.data ?? []);
        setPagination(json.pagination ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setArticles([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{t("knowledge.title")}</h1>
        <form
          onSubmit={handleSearchSubmit}
          className="flex w-full max-w-[18rem] gap-2 sm:w-auto sm:max-w-[20rem]"
        >
          <input
            type="search"
            placeholder={t("knowledge.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-card-border bg-card px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button type="submit" variant="secondary">
            {t("knowledge.search")}
          </Button>
        </form>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-5 w-3/4 rounded bg-card-border/50" />
              <div className="mt-3 h-4 w-1/2 rounded bg-card-border/30" />
              <div className="mt-2 flex gap-2">
                <div className="h-5 w-16 rounded-full bg-card-border/30" />
                <div className="h-5 w-16 rounded-full bg-card-border/30" />
              </div>
            </Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState title={typeof t("knowledge.empty") === "string" ? t("knowledge.empty") as string : undefined} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {articles.map((a) => (
              <Link key={a.id} href={`/knowledge/${a.id}`}>
                <Card className="hover:border-accent/30 hover:shadow-[0_4px_24px_rgba(0,200,255,0.06)] hover:-translate-y-0.5">
                  <h3 className="font-semibold text-foreground line-clamp-2">
                    {a.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{a.agent.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Array.isArray(a.tags) ? a.tags : []).slice(0, 4).map(
                      (tag) => (
                        <Badge key={tag} variant="muted" className="text-xs">
                          {tag}
                        </Badge>
                      )
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                    <span>{a.viewCount} {t("common.views")}</span>
                    <span>{formatTimeAgo(a.createdAt)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("common.prevPage")}
              </Button>
              <span className="text-sm text-muted">
                {t("common.pageOf", { page: pagination.page, total: pagination.totalPages })}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pagination.totalPages}
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
              >
                {t("common.nextPage")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
