"use client";

import Link from "next/link";

import { MarkdownContent } from "@/components/content/markdown-content";
import {
  resolveKnowledgeMarkdownHref,
  slugifyMarkdownHeading,
} from "@/components/content/markdown-link-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { KnowledgeDocument } from "@/lib/knowledge-base/types";
import { KnowledgeDocumentToc, type KnowledgeHeading } from "./knowledge-document-toc";
import { stripLeadingMarkdownTitle } from "./strip-leading-markdown-title";

type KnowledgeDocumentViewProps = {
  document: KnowledgeDocument | null;
  state?: "ready" | "not_found";
};

function toKnowledgeHref(targetPath: string) {
  if (!targetPath) return "/knowledge";
  const encodedPath = targetPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/knowledge/${encodedPath}`;
}

function extractKnowledgeHeadings(content: string): KnowledgeHeading[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      level: match[1].length,
      label: match[2].trim(),
      id: slugifyMarkdownHeading(match[2].trim()),
    }))
    .filter((heading) => Boolean(heading.id));
}

export function KnowledgeDocumentView({
  document,
  state = "ready",
}: KnowledgeDocumentViewProps) {
  const t = useT();

  if (state === "not_found" || !document) {
    return (
      <div className="space-y-6" data-knowledge-state="not-found">
        <Link href="/knowledge">
          <Button variant="secondary">{t("knowledge.backToKnowledge")}</Button>
        </Link>
        <Card className="py-12 text-center text-danger">
          {t("knowledge.documentNotFound")}
        </Card>
      </div>
    );
  }

  const segments = document.path.split("/").filter(Boolean);
  const parentHref = toKnowledgeHref(document.directoryPath);
  const body = stripLeadingMarkdownTitle(document.body, document.title);
  const headings = extractKnowledgeHeadings(body);

  return (
    <div className="space-y-6" data-knowledge-kind="document">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={parentHref}>
          <Button variant="secondary">{t("knowledge.backToKnowledge")}</Button>
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/knowledge" className="transition hover:text-foreground">
            {t("knowledge.rootLabel")}
          </Link>
          {segments.map((segment, index) => {
            const partialPath = segments.slice(0, index + 1).join("/");
            const isLast = index === segments.length - 1;
            return (
              <span key={partialPath} className="flex items-center gap-2">
                <span>/</span>
                {isLast ? (
                  <span>{segment}</span>
                ) : (
                  <Link href={toKnowledgeHref(partialPath)} className="transition hover:text-foreground">
                    {segment}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {document.title}
          </h1>
          {document.summary ? (
            <p className="mt-3 text-sm text-muted">{document.summary}</p>
          ) : null}
          {document.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {document.tags.map((tag) => (
                <Badge key={tag} variant="muted" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-6 border-t border-card-border pt-6">
            <MarkdownContent
              content={body}
              resolveHref={(href) => resolveKnowledgeMarkdownHref(href, document.directoryPath)}
            />
          </div>
        </Card>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <KnowledgeDocumentToc headings={headings} />
        </div>
      </div>
    </div>
  );
}
