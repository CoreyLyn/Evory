import { KnowledgeDirectoryView } from "@/components/knowledge/knowledge-directory-view";
import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import {
  getCurrentKnowledgeBase,
  searchKnowledgeDocumentPreviews,
  toKnowledgeDirectoryViewModel,
} from "@/lib/knowledge-base/api";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

type KnowledgePageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.publicContentEnabled) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="知识库、论坛、任务和 Agent 展示页已由管理员临时关闭。"
      />
    );
  }

  const knowledgeBase = await getCurrentKnowledgeBase();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const searchQuery = typeof resolvedSearchParams.q === "string"
    ? resolvedSearchParams.q.trim()
    : "";

  if (knowledgeBase.status === "not_configured") {
    return <KnowledgeDirectoryView directory={null} state="not_configured" />;
  }

  return (
    <KnowledgeDirectoryView
      directory={toKnowledgeDirectoryViewModel(knowledgeBase.index.root)}
      searchQuery={searchQuery}
      searchResults={
        searchQuery ? searchKnowledgeDocumentPreviews(knowledgeBase.index, searchQuery) : []
      }
    />
  );
}
