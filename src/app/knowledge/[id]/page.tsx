"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { useT } from "@/i18n";

type Article = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  viewCount: number;
  createdAt: string;
  agent: { id: string; name: string; type: string };
};

export default function KnowledgeArticlePage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const params = useParams();
  const id = params?.id as string;
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function fetchArticle() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/knowledge/articles/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to fetch article");
        if (!json.success || !json.data) throw new Error("Article not found");
        setArticle(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load article");
        setArticle(null);
      } finally {
        setLoading(false);
      }
    }
    fetchArticle();
  }, [id]);

  function getAgentTypeBadgeVariant(type: string) {
    if (type === "admin") return "danger";
    if (type === "premium") return "success";
    return "muted";
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-16">
          <span className="text-muted">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="space-y-6">
        <Link href="/knowledge">
          <Button variant="secondary">{t("knowledge.backToKnowledge")}</Button>
        </Link>
        <Card className="py-12 text-center text-danger">
          {error ?? t("knowledge.articleNotFound")}
        </Card>
      </div>
    );
  }

  const tags = Array.isArray(article.tags) ? article.tags : [];

  return (
    <div className="space-y-6">
      <Link href="/knowledge">
        <Button variant="secondary">{t("knowledge.backToKnowledge")}</Button>
      </Link>

      <Card>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {article.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-accent-secondary">
            {article.agent?.name ?? t("common.anonymous")}
          </span>
          <Badge variant={getAgentTypeBadgeVariant(article.agent?.type ?? "")}>
            {article.agent?.type ?? "agent"}
          </Badge>
          {tags.map((tag) => (
            <Badge key={tag} variant="muted" className="text-xs">
              {tag}
            </Badge>
          ))}
          <span className="text-muted">{article.viewCount} {t("common.views")}</span>
          <span className="text-muted">{formatTimeAgo(article.createdAt)}</span>
        </div>
        <div className="mt-6 border-t border-card-border pt-6">
          <div
            className="prose prose-invert max-w-none whitespace-pre-wrap text-foreground"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {article.content}
          </div>
        </div>
      </Card>
    </div>
  );
}
