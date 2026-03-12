"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { KnowledgeDirectoryNode, KnowledgeDocument } from "@/lib/knowledge-base/types";
import { useT } from "@/i18n";

type KnowledgeDirectoryViewProps = {
  directory: KnowledgeDirectoryNode | null;
  searchQuery?: string;
  searchResults?: KnowledgeDocument[];
  searchAction?: string;
  showSearch?: boolean;
  state?: "ready" | "not_configured";
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

function splitDirectoryPath(targetPath: string) {
  if (!targetPath) return [];
  return targetPath.split("/").filter(Boolean);
}

export function KnowledgeDirectoryView({
  directory,
  searchQuery = "",
  searchResults = [],
  searchAction = "/knowledge",
  showSearch = true,
  state = "ready",
}: KnowledgeDirectoryViewProps) {
  const t = useT();
  const title = directory?.path ? directory.title : t("knowledge.title");
  const description = searchQuery
    ? t("knowledge.searchResultsSummary", {
        query: searchQuery,
        count: searchResults.length,
      })
    : directory?.document?.summary || t("knowledge.browserDescription");

  const searchForm = (
    <form
      action={searchAction}
      className="flex w-full max-w-[18rem] gap-2 sm:w-auto sm:max-w-[20rem]"
    >
      <input
        type="search"
        name="q"
        placeholder={t("knowledge.searchPlaceholder")}
        defaultValue={searchQuery}
        className="min-w-0 flex-1 rounded-lg border border-card-border bg-card px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <Button type="submit" variant="secondary">
        {t("knowledge.search")}
      </Button>
    </form>
  );

  if (state === "not_configured") {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("knowledge.title")}
          description={t("knowledge.browserDescription")}
          rightSlot={showSearch ? searchForm : null}
        />
        <div data-knowledge-state="not-configured">
          <EmptyState
            title={t("knowledge.notConfiguredTitle")}
            description={t("knowledge.notConfiguredDescription")}
          />
        </div>
      </div>
    );
  }

  if (!directory) return null;

  const breadcrumbs = splitDirectoryPath(directory.path);
  const showEmptyDirectory =
    !searchQuery &&
    !directory.document &&
    directory.directories.length === 0 &&
    directory.documents.length === 0;

  return (
    <div className="space-y-6" data-knowledge-kind="directory">
      <PageHeader
        title={title}
        description={description}
        rightSlot={showSearch ? searchForm : null}
      />

      <nav
        className="flex flex-wrap items-center gap-2 text-sm text-muted"
        data-knowledge-breadcrumbs={directory.path || "root"}
      >
        <Link href="/knowledge" className="transition hover:text-foreground">
          {t("knowledge.rootLabel")}
        </Link>
        {breadcrumbs.map((segment, index) => {
          const partialPath = breadcrumbs.slice(0, index + 1).join("/");
          return (
            <span key={partialPath} className="flex items-center gap-2">
              <span>/</span>
              <Link href={toKnowledgeHref(partialPath)} className="transition hover:text-foreground">
                {segment}
              </Link>
            </span>
          );
        })}
      </nav>

      {directory.document ? (
        <Card>
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">
            {t("knowledge.directoryLandingLabel")}
          </div>
          <div className="prose prose-invert max-w-none text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {directory.document.body}
            </ReactMarkdown>
          </div>
        </Card>
      ) : null}

      {searchQuery ? (
        <section className="space-y-4" data-knowledge-section="search-results">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {t("knowledge.searchResultsHeading")}
          </h2>
          {searchResults.length === 0 ? (
            <EmptyState
              title={t("knowledge.searchEmptyTitle")}
              description={t("knowledge.searchEmptyDescription")}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((document) => (
                <Link key={document.path} href={toKnowledgeHref(document.path)}>
                  <Card className="h-full hover:border-accent/30 hover:shadow-[0_4px_24px_rgba(0,200,255,0.06)] hover:-translate-y-0.5">
                    <h3 className="font-semibold text-foreground">{document.title}</h3>
                    <p className="mt-2 text-sm text-muted">{document.summary}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="space-y-4" data-knowledge-section="directories">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {t("knowledge.directoriesHeading")}
            </h2>
            {directory.directories.length === 0 ? (
              <p className="text-sm text-muted">{t("knowledge.noDirectories")}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {directory.directories.map((childDirectory) => (
                  <Link key={childDirectory.path} href={toKnowledgeHref(childDirectory.path)}>
                    <Card className="h-full hover:border-accent/30 hover:shadow-[0_4px_24px_rgba(0,200,255,0.06)] hover:-translate-y-0.5">
                      <h3 className="font-semibold text-foreground">{childDirectory.title}</h3>
                      <p className="mt-2 text-sm text-muted">
                        {childDirectory.document?.summary || t("knowledge.directoryCardFallback")}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4" data-knowledge-section="documents">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {t("knowledge.documentsHeading")}
            </h2>
            {directory.documents.length === 0 ? (
              <p className="text-sm text-muted">{t("knowledge.noDocuments")}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {directory.documents.map((document) => (
                  <Link key={document.path} href={toKnowledgeHref(document.path)}>
                    <Card className="h-full hover:border-accent/30 hover:shadow-[0_4px_24px_rgba(0,200,255,0.06)] hover:-translate-y-0.5">
                      <h3 className="font-semibold text-foreground">{document.title}</h3>
                      <p className="mt-2 text-sm text-muted">{document.summary}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showEmptyDirectory ? (
        <div data-knowledge-state="empty-directory">
          <EmptyState
            title={t("knowledge.emptyDirectoryTitle")}
            description={t("knowledge.emptyDirectoryDescription")}
          />
        </div>
      ) : null}
    </div>
  );
}
